import {
  forEachBreedingOutcome,
  getRuntimeChildIndex,
  getRuntimePalIndex,
  runtimePals,
} from "../../data/breedingRuntime";
import { getPalGenderProbability } from "../../data/palStatsRepository";
import type { OwnedPal, PalLocation } from "../../domain/inventory";
import type { PalGender, PalId } from "../../domain/pal";
import type { PassiveGoal, PassiveId } from "../../domain/passive";
import { estimatePassiveOdds } from "./passiveProbability";

export type BuilderObjective = "recommended" | "fewest" | "cleanest";

export type BuilderIvScores = Readonly<{
  hp: number;
  attack: number;
  defense: number;
}>;

export type BuilderParentPassives =
  | { kind: "known"; ids: readonly PassiveId[] }
  | { kind: "bounded"; ids: readonly PassiveId[]; maxExtras: number }
  | { kind: "any" };

type BuilderParentBase = {
  speciesId: PalId;
  gender: PalGender;
  passives: BuilderParentPassives;
  ivScores?: BuilderIvScores;
};

export type BuilderParent =
  | BuilderParentBase & {
      origin: "inventory";
      level?: number;
      location: PalLocation;
      palboxSlotIndex?: number;
    }
  | BuilderParentBase & { origin: "planned"; level: 1 };

export type BuilderStep = {
  id: string;
  firstParent: BuilderParent;
  firstParentStepId?: string;
  secondParent: BuilderParent;
  secondParentStepId?: string;
  result: PalId;
  resultPassives: BuilderParentPassives;
  odds: number;
  expectedCakes: number;
};

export type BuilderResult =
  | {
      status: "found";
      steps: readonly BuilderStep[];
      expectedCakes: number;
      strategy: "standard" | "iv-reroll";
    }
  | {
      status: "missing-passives";
      missingPassiveIds: readonly PassiveId[];
      reason: string;
    }
  | { status: "no-route"; reason: string };

export type BuilderInput = {
  inventory: readonly OwnedPal[];
  targetId: PalId;
  passiveGoal: PassiveGoal;
  objective: BuilderObjective;
};

type EncodedOwnedPal = {
  pal: OwnedPal;
  speciesIndex: number;
  passiveIds: readonly PassiveId[];
  requiredMask: number;
  extraCount: number;
  ivScores?: BuilderIvScores;
};

type PartnerAction = {
  childIndex: number;
  partnerIndex: number;
};

type TargetPairing = {
  firstSpeciesIndex: number;
  secondSpeciesIndex: number;
  firstGender?: PalGender;
  secondGender?: PalGender;
};

type QueueEntry = {
  state: number;
  steps: number;
  expectedCakes: number;
  ivQuality: number;
};

const MAX_PASSIVES = 4;
const EXTRA_VARIANTS = MAX_PASSIVES + 1;
const GENDER_VARIANTS = 3;
const ANY_GENDER_INDEX = 2;
const UNVISITED_PARENT = -0x80000000;
const UNREACHED_STEPS = 0xffff;
const MAX_CACHED_PARENT_UNION = MAX_PASSIVES * 3;
const ODDS_DIMENSION = MAX_PASSIVES + 1;
const IV_PARENT_SHARE = 0.3;
const IV_RANDOM_SHARE = 0.4;
const AVERAGE_RANDOM_IV = 50.5;
const PAIRING_PRIMARY_WEIGHT = 1000;
const UNKNOWN_IV_QUALITY = Number.NEGATIVE_INFINITY;
const passiveOdds = new Float64Array(
  (MAX_CACHED_PARENT_UNION + 1) * ODDS_DIMENSION * ODDS_DIMENSION,
);

for (let parentUnionSize = 0; parentUnionSize <= MAX_CACHED_PARENT_UNION; parentUnionSize += 1) {
  for (let desiredCount = 0; desiredCount <= MAX_PASSIVES; desiredCount += 1) {
    for (let allowedExtras = 0; allowedExtras <= MAX_PASSIVES; allowedExtras += 1) {
      passiveOdds[oddsOffset(parentUnionSize, desiredCount, allowedExtras)] = estimatePassiveOdds(
        parentUnionSize,
        { kind: "specific", desiredCount, allowedExtras },
      );
    }
  }
}

export function buildPal(input: BuilderInput): BuilderResult {
  const inventory = input.inventory;
  const passiveGoal = input.passiveGoal;
  const acceptsAnyPassives = passiveGoal.kind === "any";
  const required: PassiveId[] = passiveGoal.kind === "any"
    ? []
    : [...new Set(passiveGoal.requiredIds)].slice(0, MAX_PASSIVES);
  const allowedExtras = passiveGoal.kind === "any" ? MAX_PASSIVES : passiveGoal.allowedExtras;
  const available = new Set(inventory.flatMap(({ passiveIds: ids }) => ids));
  const missing = required.filter((id) => !available.has(id));
  if (missing.length) {
    return {
      status: "missing-passives",
      missingPassiveIds: missing,
      reason: "This world doesn't have every passive you chose yet. Add a Pal with each missing passive, then try again.",
    };
  }
  if (!inventory.length) return { status: "no-route", reason: "Import a world before building." };

  const requiredIndex = new Map(required.map((id, index) => [id, index]));
  const fullMask = (1 << required.length) - 1;
  const maskVariants = 1 << required.length;
  const encodedInventory = inventory.map((pal): EncodedOwnedPal => {
    const passiveIds = [...new Set(pal.passiveIds)];
    let requiredMask = 0;
    let extraCount = 0;
    for (const id of passiveIds) {
      const index = requiredIndex.get(id);
      if (index === undefined) extraCount += 1;
      else requiredMask |= 1 << index;
    }
    return {
      pal,
      speciesIndex: getRuntimePalIndex(pal.speciesId) ?? -1,
      passiveIds,
      requiredMask,
      extraCount,
      ivScores: getInventoryIvScores(pal),
    };
  });

  const isIvReroll = encodedInventory.some(({ pal }) => pal.speciesId === input.targetId);

  const targetIndex = getRuntimePalIndex(input.targetId);
  if (targetIndex === undefined) return noRoute();
  const targetPairings = getTargetPairings(input.targetId);

  const actionsBySpecies = buildPartnerActions(
    encodedInventory,
    maskVariants,
    acceptsAnyPassives,
    isIvReroll,
  );
  const stateCount = runtimePals.length * maskVariants * EXTRA_VARIANTS * GENDER_VARIANTS;
  const bestSteps = new Uint16Array(stateCount).fill(UNREACHED_STEPS);
  const bestExpectedCakes = new Float64Array(stateCount).fill(Number.POSITIVE_INFINITY);
  const bestIvQuality = new Float64Array(stateCount).fill(UNKNOWN_IV_QUALITY);
  const bestIvHp = isIvReroll ? new Float64Array(stateCount).fill(Number.NaN) : undefined;
  const bestIvAttack = isIvReroll ? new Float64Array(stateCount).fill(Number.NaN) : undefined;
  const bestIvDefense = isIvReroll ? new Float64Array(stateCount).fill(Number.NaN) : undefined;
  const getStateIvScores = (state: number): BuilderIvScores | undefined => {
    if (!bestIvHp || !bestIvAttack || !bestIvDefense || Number.isNaN(bestIvHp[state])) {
      return undefined;
    }
    return {
      hp: bestIvHp[state],
      attack: bestIvAttack[state],
      defense: bestIvDefense[state],
    };
  };
  const firstParentRef = new Int32Array(stateCount).fill(UNVISITED_PARENT);
  const secondParentRef = new Int32Array(stateCount).fill(UNVISITED_PARENT);
  const edgeOdds = new Float64Array(stateCount);
  const settled = new Uint8Array(stateCount);
  const settledBySpeciesAndGender: number[][] = Array.from(
    { length: runtimePals.length * 2 },
    () => [],
  );
  const queue = new StatePriorityQueue(input.objective, isIvReroll, stateCount);

  const recordFinalState = (
    maxUnknownExtraCount: number,
    odds: number,
    steps: number,
    expectedCakes: number,
    ivQuality: number,
    firstRef: number,
    secondRef: number,
  ) => {
    if (odds <= 0) return;
    const state = encodeState(
      targetIndex,
      fullMask,
      maxUnknownExtraCount,
      undefined,
      maskVariants,
    );
    const nextSteps = steps + 1;
    const nextExpectedCakes = expectedCakes + 1 / odds;
    if (bestSteps[state] !== UNREACHED_STEPS && compareLabels(
      nextSteps,
      nextExpectedCakes,
      maxUnknownExtraCount,
      bestSteps[state],
      bestExpectedCakes[state],
      maxUnknownExtraCount,
      input.objective,
      ivQuality,
      bestIvQuality[state],
      isIvReroll,
    ) >= 0) return;

    bestSteps[state] = nextSteps;
    bestExpectedCakes[state] = nextExpectedCakes;
    bestIvQuality[state] = ivQuality;
    firstParentRef[state] = firstRef;
    secondParentRef[state] = secondRef;
    edgeOdds[state] = odds;
  };

  const relaxState = (
    childIndex: number,
    nextMask: number,
    maxUnknownExtraCount: number,
    gender: PalGender | undefined,
    odds: number,
    steps: number,
    expectedCakes: number,
    ivQuality: number,
    ivScores: BuilderIvScores | undefined,
    firstRef: number,
    secondRef: number,
  ) => {
    if (odds <= 0) return;
    const state = encodeState(
      childIndex,
      nextMask,
      maxUnknownExtraCount,
      gender,
      maskVariants,
    );
    if (settled[state]) return;
    if (bestSteps[state] !== UNREACHED_STEPS && compareLabels(
      steps,
      expectedCakes,
      maxUnknownExtraCount,
      bestSteps[state],
      bestExpectedCakes[state],
      maxUnknownExtraCount,
      input.objective,
      ivQuality,
      bestIvQuality[state],
      isIvReroll,
    ) >= 0) return;

    bestSteps[state] = steps;
    bestExpectedCakes[state] = expectedCakes;
    bestIvQuality[state] = ivQuality;
    if (ivScores && bestIvHp && bestIvAttack && bestIvDefense) {
      bestIvHp[state] = ivScores.hp;
      bestIvAttack[state] = ivScores.attack;
      bestIvDefense[state] = ivScores.defense;
    }
    firstParentRef[state] = firstRef;
    secondParentRef[state] = secondRef;
    edgeOdds[state] = odds;
    queue.push(state, steps, expectedCakes, ivQuality);
  };

  const relaxHatchGenders = (
    childIndex: number,
    nextMask: number,
    maxUnknownExtraCount: number,
    passiveChance: number,
    isFinalHatch: boolean,
    currentSteps: number,
    currentExpectedCakes: number,
    ivQuality: number,
    ivScores: BuilderIvScores | undefined,
    firstRef: number,
    secondRef: number,
  ) => {
    if (isFinalHatch) {
      recordFinalState(
        maxUnknownExtraCount,
        passiveChance,
        currentSteps,
        currentExpectedCakes,
        ivQuality,
        firstRef,
        secondRef,
      );
      return;
    }

    for (const gender of ["F", "M"] as const) {
      const odds = passiveChance * getPalGenderProbability(
        runtimePals[childIndex].id,
        gender,
      );
      relaxState(
        childIndex,
        nextMask,
        maxUnknownExtraCount,
        gender,
        odds,
        currentSteps + 1,
        currentExpectedCakes + 1 / odds,
        ivQuality,
        ivScores,
        firstRef,
        secondRef,
      );
    }
  };

  const relaxOutcome = (
    childIndex: number,
    nextMask: number,
    parentUnionSize: number,
    currentSteps: number,
    currentExpectedCakes: number,
    firstIvScores: BuilderIvScores | undefined,
    secondIvScores: BuilderIvScores | undefined,
    firstRef: number,
    secondRef: number,
  ) => {
    const desiredCount = countBits(nextMask);
    const availableExtraSlots = MAX_PASSIVES - desiredCount;
    const isFinalHatch = childIndex === targetIndex && nextMask === fullMask;
    const ivScores = isIvReroll
      ? estimateOffspringIvScores(firstIvScores, secondIvScores)
      : undefined;
    const ivQuality = isFinalHatch
      ? getPairingIvQuality(firstIvScores, secondIvScores)
      : getIvScoreTotal(ivScores);
    if (acceptsAnyPassives) {
      relaxHatchGenders(
        childIndex,
        nextMask,
        0,
        1,
        isFinalHatch,
        currentSteps,
        currentExpectedCakes,
        ivQuality,
        ivScores,
        firstRef,
        secondRef,
      );
      return;
    }

    const maxExtras = isFinalHatch
      ? Math.min(allowedExtras, availableExtraSlots)
      : availableExtraSlots;
    const firstExtraLimit = isFinalHatch ? maxExtras : 0;
    let previousOdds = 0;

    for (let acceptedExtras = firstExtraLimit; acceptedExtras <= maxExtras; acceptedExtras += 1) {
      const passiveChance = getPassiveOdds(parentUnionSize, desiredCount, acceptedExtras);
      if (passiveChance <= previousOdds) continue;
      previousOdds = passiveChance;
      relaxHatchGenders(
        childIndex,
        nextMask,
        acceptedExtras,
        passiveChance,
        isFinalHatch,
        currentSteps,
        currentExpectedCakes,
        ivQuality,
        ivScores,
        firstRef,
        secondRef,
      );
    }
  };

  for (let firstIndex = 0; firstIndex < encodedInventory.length; firstIndex += 1) {
    const first = encodedInventory[firstIndex];
    if (first.speciesIndex < 0) continue;

    for (let secondIndex = firstIndex + 1; secondIndex < encodedInventory.length; secondIndex += 1) {
      const second = encodedInventory[secondIndex];
      if (
        second.speciesIndex < 0
        || first.pal.id === second.pal.id
        || first.pal.gender === second.pal.gender
      ) continue;
      const childIndex = getRuntimeChildIndex(
        first.speciesIndex,
        second.speciesIndex,
        second.pal.gender,
      );
      if (childIndex < 0) continue;
      relaxOutcome(
        childIndex,
        first.requiredMask | second.requiredMask,
        acceptsAnyPassives ? 0 : passiveUnionSize(first.passiveIds, second.passiveIds),
        0,
        0,
        first.ivScores,
        second.ivScores,
        encodeInventoryRef(firstIndex),
        encodeInventoryRef(secondIndex),
      );
    }
  }

  while (queue.size) {
    const current = queue.pop();
    if (
      !current
      || bestSteps[current.state] !== current.steps
      || bestExpectedCakes[current.state] !== current.expectedCakes
      || bestIvQuality[current.state] !== current.ivQuality
      || settled[current.state]
    ) continue;

    const decoded = decodeState(current.state, maskVariants);
    settled[current.state] = 1;
    if (decoded.gender !== undefined) {
      settledBySpeciesAndGender[
        speciesGenderOffset(decoded.speciesIndex, decoded.gender)
      ].push(current.state);
    }
    for (const action of actionsBySpecies[decoded.speciesIndex]) {
      const partner = encodedInventory[action.partnerIndex];
      if (decoded.gender === undefined || decoded.gender === partner.pal.gender) continue;
      const nextMask = decoded.mask | partner.requiredMask;
      relaxOutcome(
        action.childIndex,
        nextMask,
        acceptsAnyPassives
          ? 0
          : countBits(nextMask) + partner.extraCount + decoded.maxUnknownExtraCount,
        current.steps,
        current.expectedCakes,
        getStateIvScores(current.state),
        partner.ivScores,
        current.state,
        encodeInventoryRef(action.partnerIndex),
      );
    }
  }

  const combineGroups = (firstStates: readonly number[], secondStates: readonly number[]) => {
    for (const firstState of firstStates) {
      const first = decodeState(firstState, maskVariants);
      for (const secondState of secondStates) {
        const second = decodeState(secondState, maskVariants);
        const nextMask = first.mask | second.mask;
        if (nextMask !== fullMask) continue;
        relaxOutcome(
          targetIndex,
          nextMask,
          acceptsAnyPassives
            ? 0
            : countBits(nextMask)
              + first.maxUnknownExtraCount
              + second.maxUnknownExtraCount,
          bestSteps[firstState] + bestSteps[secondState],
          bestExpectedCakes[firstState] + bestExpectedCakes[secondState],
          getStateIvScores(firstState),
          getStateIvScores(secondState),
          firstState,
          secondState,
        );
      }
    }
  };

  // Join two independently planned branches only at the requested final hatch.
  // Pairing every intermediate state with every other state made full Palboxes
  // quadratic in both work and retained queue memory.
  for (const pairing of targetPairings) {
    if (pairing.firstGender && pairing.secondGender) {
      combineGroups(
        settledBySpeciesAndGender[
          speciesGenderOffset(pairing.firstSpeciesIndex, pairing.firstGender)
        ],
        settledBySpeciesAndGender[
          speciesGenderOffset(pairing.secondSpeciesIndex, pairing.secondGender)
        ],
      );
      continue;
    }
    combineGroups(
      settledBySpeciesAndGender[speciesGenderOffset(pairing.firstSpeciesIndex, "F")],
      settledBySpeciesAndGender[speciesGenderOffset(pairing.secondSpeciesIndex, "M")],
    );
    if (pairing.firstSpeciesIndex !== pairing.secondSpeciesIndex) {
      combineGroups(
        settledBySpeciesAndGender[speciesGenderOffset(pairing.firstSpeciesIndex, "M")],
        settledBySpeciesAndGender[speciesGenderOffset(pairing.secondSpeciesIndex, "F")],
      );
    }
  }

  let bestTargetState: number | undefined;
  for (let extraCount = 0; extraCount <= allowedExtras; extraCount += 1) {
    const state = encodeState(targetIndex, fullMask, extraCount, undefined, maskVariants);
    if (bestSteps[state] === UNREACHED_STEPS) continue;
    if (
      bestTargetState === undefined
      || compareLabels(
        bestSteps[state],
        bestExpectedCakes[state],
        extraCount,
        bestSteps[bestTargetState],
        bestExpectedCakes[bestTargetState],
        stateExtraCount(bestTargetState),
        input.objective,
        bestIvQuality[state],
        bestIvQuality[bestTargetState],
        isIvReroll,
      ) < 0
    ) {
      bestTargetState = state;
    }
  }

  return bestTargetState === undefined
    ? noRoute()
    : {
        status: "found",
        steps: reconstruct(
          bestTargetState,
          maskVariants,
          encodedInventory,
          required,
          acceptsAnyPassives,
          firstParentRef,
          secondParentRef,
          edgeOdds,
        ),
        expectedCakes: bestExpectedCakes[bestTargetState],
        strategy: isIvReroll ? "iv-reroll" : "standard",
      };
}

function getTargetPairings(targetId: PalId) {
  const pairings: TargetPairing[] = [];
  forEachBreedingOutcome((outcome) => {
    if (outcome.childId !== targetId) return;
    const firstSpeciesIndex = getRuntimePalIndex(outcome.firstParentId);
    const secondSpeciesIndex = getRuntimePalIndex(outcome.secondParentId);
    if (firstSpeciesIndex === undefined || secondSpeciesIndex === undefined) return;
    pairings.push({
      firstSpeciesIndex,
      secondSpeciesIndex,
      firstGender: outcome.firstParentGender,
      secondGender: outcome.secondParentGender,
    });
  });
  return pairings;
}

function buildPartnerActions(
  inventory: readonly EncodedOwnedPal[],
  maskVariants: number,
  acceptsAnyPassives: boolean,
  optimizeIvs: boolean,
) {
  return runtimePals.map((_, firstParentIndex): readonly PartnerAction[] => {
    const bestPartnersByOutcome = new Map<number, number[]>();

    for (let partnerIndex = 0; partnerIndex < inventory.length; partnerIndex += 1) {
      const partner = inventory[partnerIndex];
      if (partner.speciesIndex < 0) continue;
      const childIndex = getRuntimeChildIndex(
        firstParentIndex,
        partner.speciesIndex,
        partner.pal.gender,
      );
      if (childIndex < 0) continue;
      const actionKey = (
        (childIndex * maskVariants + partner.requiredMask) * 2
      ) + (partner.pal.gender === "M" ? 1 : 0);
      const existingIndices = bestPartnersByOutcome.get(actionKey) ?? [];
      if (!optimizeIvs) {
        const existing = existingIndices[0];
        if (
          existing !== undefined
          && (acceptsAnyPassives || inventory[existing].extraCount <= partner.extraCount)
        ) continue;
        bestPartnersByOutcome.set(actionKey, [partnerIndex]);
        continue;
      }

      if (!acceptsAnyPassives && existingIndices.length) {
        const cleanestExtraCount = inventory[existingIndices[0]].extraCount;
        if (cleanestExtraCount < partner.extraCount) continue;
        if (partner.extraCount < cleanestExtraCount) {
          bestPartnersByOutcome.set(actionKey, [partnerIndex]);
          continue;
        }
      }
      bestPartnersByOutcome.set(
        actionKey,
        selectIvPartnerRepresentatives(existingIndices.concat(partnerIndex), inventory),
      );
    }

    return [...bestPartnersByOutcome].flatMap(([actionKey, partnerIndices]) => (
      partnerIndices.map((partnerIndex) => ({
        childIndex: Math.floor(actionKey / (maskVariants * 2)),
        partnerIndex,
      }))
    ));
  });
}

function reconstruct(
  targetState: number,
  maskVariants: number,
  inventory: readonly EncodedOwnedPal[],
  required: readonly PassiveId[],
  acceptsAnyPassives: boolean,
  firstParentRef: Int32Array,
  secondParentRef: Int32Array,
  edgeOdds: Float64Array,
) {
  const steps: BuilderStep[] = [];
  const appendState = (state: number): string => {
    const firstRef = firstParentRef[state];
    const secondRef = secondParentRef[state];
    if (firstRef === UNVISITED_PARENT || secondRef === UNVISITED_PARENT) {
      throw new Error("A planned breeding step is missing its parents.");
    }
    const firstParentStepId = firstRef >= 0 ? appendState(firstRef) : undefined;
    const secondParentStepId = secondRef >= 0 ? appendState(secondRef) : undefined;

    const resultState = decodeState(state, maskVariants);
    const resultPassives = passivesForState(
      resultState.mask,
      resultState.maxUnknownExtraCount,
      required,
      acceptsAnyPassives,
    );
    const odds = edgeOdds[state];
    const id = `step-${steps.length + 1}`;
    steps.push({
      id,
      firstParent: createParentFromRef(
        firstRef,
        maskVariants,
        inventory,
        required,
        acceptsAnyPassives,
        firstParentRef,
      ),
      firstParentStepId,
      secondParent: createParentFromRef(
        secondRef,
        maskVariants,
        inventory,
        required,
        acceptsAnyPassives,
        firstParentRef,
      ),
      secondParentStepId,
      result: runtimePals[resultState.speciesIndex].id,
      resultPassives,
      odds,
      expectedCakes: 1 / odds,
    });
    return id;
  };

  appendState(targetState);
  return steps;
}

function createParentFromRef(
  ref: number,
  maskVariants: number,
  inventory: readonly EncodedOwnedPal[],
  required: readonly PassiveId[],
  acceptsAnyPassives: boolean,
  firstParentRef: Int32Array,
) {
  if (ref < 0) return createInventoryParent(inventory[decodeInventoryRef(ref)].pal);
  if (firstParentRef[ref] === UNVISITED_PARENT) {
    throw new Error("A planned breeding parent has no production step.");
  }
  return createPlannedParent(
    decodeState(ref, maskVariants),
    required,
    acceptsAnyPassives,
  );
}

function createPlannedParent(
  state: {
    speciesIndex: number;
    mask: number;
    maxUnknownExtraCount: number;
    gender: PalGender | undefined;
  },
  required: readonly PassiveId[],
  acceptsAnyPassives: boolean,
): BuilderParent {
  if (!state.gender) throw new Error("A planned breeding parent must have a gender.");
  return {
    speciesId: runtimePals[state.speciesIndex].id,
    origin: "planned",
    level: 1,
    gender: state.gender,
    passives: passivesForState(
      state.mask,
      state.maxUnknownExtraCount,
      required,
      acceptsAnyPassives,
    ),
  };
}

function createInventoryParent(pal: OwnedPal): BuilderParent {
  return {
    speciesId: pal.speciesId,
    origin: "inventory",
    level: pal.level,
    gender: pal.gender,
    ivScores: getInventoryIvScores(pal),
    passives: { kind: "known", ids: [...new Set(pal.passiveIds)] },
    location: pal.location,
    palboxSlotIndex: pal.palboxSlotIndex,
  };
}

function passivesForState(
  mask: number,
  maxUnknownExtraCount: number,
  required: readonly PassiveId[],
  acceptsAnyPassives: boolean,
): BuilderParentPassives {
  if (acceptsAnyPassives) return { kind: "any" };
  const ids = required.filter((_, index) => (mask & (1 << index)) !== 0);
  return maxUnknownExtraCount === 0
    ? { kind: "known", ids }
    : { kind: "bounded", ids, maxExtras: maxUnknownExtraCount };
}

function compareLabels(
  firstSteps: number,
  firstExpectedCakes: number,
  firstExtraCount: number,
  secondSteps: number,
  secondExpectedCakes: number,
  secondExtraCount: number,
  objective: BuilderObjective,
  firstIvQuality = UNKNOWN_IV_QUALITY,
  secondIvQuality = UNKNOWN_IV_QUALITY,
  optimizeIvs = false,
) {
  const ivComparison = optimizeIvs
    ? -compareIvQuality(firstIvQuality, secondIvQuality)
    : 0;
  if (objective === "cleanest") {
    return firstExpectedCakes - secondExpectedCakes
      || ivComparison
      || firstSteps - secondSteps
      || firstExtraCount - secondExtraCount;
  }
  if (objective === "recommended") {
    return (firstExpectedCakes + firstSteps * 8) - (secondExpectedCakes + secondSteps * 8)
      || ivComparison
      || firstSteps - secondSteps
      || firstExpectedCakes - secondExpectedCakes
      || firstExtraCount - secondExtraCount;
  }
  return firstSteps - secondSteps
    || ivComparison
    || firstExpectedCakes - secondExpectedCakes
    || firstExtraCount - secondExtraCount;
}

function compareIvQuality(first: number, second: number) {
  if (first === second) return 0;
  if (first === UNKNOWN_IV_QUALITY) return -1;
  if (second === UNKNOWN_IV_QUALITY) return 1;
  return first - second;
}

function selectIvPartnerRepresentatives(
  candidates: readonly number[],
  inventory: readonly EncodedOwnedPal[],
) {
  const knownCandidates = candidates.filter((index) => inventory[index].ivScores);
  if (!knownCandidates.length) return candidates.slice(0, 1);
  // Every direct owned pair is still scored exactly. For intermediate hot-loop
  // actions, keep one all-around representative so IV rerolls stay browser-fast.
  return [knownCandidates.reduce((best, candidate) => (
    getIvScoreTotal(inventory[candidate].ivScores)
      > getIvScoreTotal(inventory[best].ivScores)
      ? candidate
      : best
  ))];
}

function getPairingIvQuality(
  first: BuilderIvScores | undefined,
  second: BuilderIvScores | undefined,
) {
  if (!first || !second) return UNKNOWN_IV_QUALITY;
  // The best source for each stat is the primary tie-break. The other source
  // breaks equal maxima because both parents independently own a 30% share.
  const strongestSources = Math.max(first.hp, second.hp)
    + Math.max(first.attack, second.attack)
    + Math.max(first.defense, second.defense);
  const backupSources = Math.min(first.hp, second.hp)
    + Math.min(first.attack, second.attack)
    + Math.min(first.defense, second.defense);
  return strongestSources * PAIRING_PRIMARY_WEIGHT + backupSources;
}

function getIvScoreTotal(scores: BuilderIvScores | undefined) {
  return scores
    ? scores.hp + scores.attack + scores.defense
    : UNKNOWN_IV_QUALITY;
}

function estimateOffspringIvScores(
  first: BuilderIvScores | undefined,
  second: BuilderIvScores | undefined,
): BuilderIvScores | undefined {
  if (!first || !second) return undefined;
  return {
    hp: estimateOffspringIvStat(first.hp, second.hp),
    attack: estimateOffspringIvStat(first.attack, second.attack),
    defense: estimateOffspringIvStat(first.defense, second.defense),
  };
}

function estimateOffspringIvStat(first: number, second: number) {
  return IV_PARENT_SHARE * first
    + IV_PARENT_SHARE * second
    + IV_RANDOM_SHARE * AVERAGE_RANDOM_IV;
}

function getInventoryIvScores(pal: OwnedPal): BuilderIvScores | undefined {
  if (!pal.abilityScores) return undefined;
  return {
    hp: pal.abilityScores.hp,
    attack: pal.abilityScores.ranged,
    defense: pal.abilityScores.defense,
  };
}

function getPassiveOdds(parentUnionSize: number, desiredCount: number, allowedExtras: number) {
  if (parentUnionSize <= MAX_CACHED_PARENT_UNION) {
    return passiveOdds[oddsOffset(parentUnionSize, desiredCount, allowedExtras)];
  }
  return estimatePassiveOdds(
    parentUnionSize,
    { kind: "specific", desiredCount, allowedExtras },
  );
}

function oddsOffset(parentUnionSize: number, desiredCount: number, allowedExtras: number) {
  return ((parentUnionSize * ODDS_DIMENSION + desiredCount) * ODDS_DIMENSION) + allowedExtras;
}

function passiveUnionSize(first: readonly PassiveId[], second: readonly PassiveId[]) {
  let size = first.length;
  for (const id of second) {
    if (!first.includes(id)) size += 1;
  }
  return size;
}

function countBits(value: number) {
  let count = 0;
  for (let remaining = value; remaining; remaining &= remaining - 1) count += 1;
  return count;
}

function encodeState(
  speciesIndex: number,
  mask: number,
  maxUnknownExtraCount: number,
  gender: PalGender | undefined,
  maskVariants: number,
) {
  return (
    ((speciesIndex * maskVariants + mask) * EXTRA_VARIANTS + maxUnknownExtraCount)
    * GENDER_VARIANTS
  ) + encodeGender(gender);
}

function decodeState(state: number, maskVariants: number) {
  const genderIndex = state % GENDER_VARIANTS;
  const withoutGender = (state - genderIndex) / GENDER_VARIANTS;
  const maxUnknownExtraCount = withoutGender % EXTRA_VARIANTS;
  const withoutExtras = (withoutGender - maxUnknownExtraCount) / EXTRA_VARIANTS;
  const mask = withoutExtras % maskVariants;
  return {
    speciesIndex: (withoutExtras - mask) / maskVariants,
    mask,
    maxUnknownExtraCount,
    gender: decodeGender(genderIndex),
  };
}

function encodeGender(gender: PalGender | undefined) {
  if (gender === "F") return 0;
  if (gender === "M") return 1;
  return ANY_GENDER_INDEX;
}

function decodeGender(index: number): PalGender | undefined {
  if (index === 0) return "F";
  if (index === 1) return "M";
  return undefined;
}

function encodeInventoryRef(index: number) {
  return -index - 1;
}

function decodeInventoryRef(ref: number) {
  return -ref - 1;
}

function noRoute(): BuilderResult {
  return {
    status: "no-route",
    reason: "We couldn't find a route to that Pal with the Pals and sexes available in this world.",
  };
}

class StatePriorityQueue {
  private readonly states: number[] = [];
  private readonly steps: number[] = [];
  private readonly expectedCakes: number[] = [];
  private readonly ivQualities: number[] = [];
  private readonly positions: Int32Array;

  constructor(
    private readonly objective: BuilderObjective,
    private readonly optimizeIvs: boolean,
    stateCount: number,
  ) {
    this.positions = new Int32Array(stateCount).fill(-1);
  }

  get size() {
    return this.states.length;
  }

  push(state: number, steps: number, expectedCakes: number, ivQuality: number) {
    const existingIndex = this.positions[state];
    if (existingIndex >= 0) {
      this.steps[existingIndex] = steps;
      this.expectedCakes[existingIndex] = expectedCakes;
      this.ivQualities[existingIndex] = ivQuality;
      this.siftUp(existingIndex);
      return;
    }

    const index = this.states.length;
    this.states.push(state);
    this.steps.push(steps);
    this.expectedCakes.push(expectedCakes);
    this.ivQualities.push(ivQuality);
    this.positions[state] = index;
    this.siftUp(index);
  }

  pop(): QueueEntry | undefined {
    if (!this.states.length) return undefined;
    const firstState = this.states[0];
    const first = {
      state: firstState,
      steps: this.steps[0],
      expectedCakes: this.expectedCakes[0],
      ivQuality: this.ivQualities[0],
    };
    const tailState = this.states.pop();
    const tailSteps = this.steps.pop();
    const tailExpectedCakes = this.expectedCakes.pop();
    const tailIvQuality = this.ivQualities.pop();
    this.positions[firstState] = -1;

    if (
      this.states.length
      && tailState !== undefined
      && tailSteps !== undefined
      && tailExpectedCakes !== undefined
      && tailIvQuality !== undefined
    ) {
      this.states[0] = tailState;
      this.steps[0] = tailSteps;
      this.expectedCakes[0] = tailExpectedCakes;
      this.ivQualities[0] = tailIvQuality;
      this.positions[tailState] = 0;
      this.siftDown(0);
    }
    return first;
  }

  private siftUp(startIndex: number) {
    let index = startIndex;
    const state = this.states[index];
    const steps = this.steps[index];
    const expectedCakes = this.expectedCakes[index];
    const ivQuality = this.ivQualities[index];
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compareAt(parent, state, steps, expectedCakes, ivQuality) <= 0) break;
      this.copyEntry(parent, index);
      index = parent;
    }
    this.setEntry(index, state, steps, expectedCakes, ivQuality);
  }

  private siftDown(startIndex: number) {
    let index = startIndex;
    const state = this.states[index];
    const steps = this.steps[index];
    const expectedCakes = this.expectedCakes[index];
    const ivQuality = this.ivQualities[index];
    while (true) {
      const left = index * 2 + 1;
      if (left >= this.states.length) break;
      const right = left + 1;
      const child = right < this.states.length && this.compareIndices(right, left) < 0
        ? right
        : left;
      if (this.compareValues(
        state,
        steps,
        expectedCakes,
        ivQuality,
        this.states[child],
        this.steps[child],
        this.expectedCakes[child],
        this.ivQualities[child],
      ) <= 0) break;
      this.copyEntry(child, index);
      index = child;
    }
    this.setEntry(index, state, steps, expectedCakes, ivQuality);
  }

  private copyEntry(from: number, to: number) {
    this.setEntry(
      to,
      this.states[from],
      this.steps[from],
      this.expectedCakes[from],
      this.ivQualities[from],
    );
  }

  private setEntry(
    index: number,
    state: number,
    steps: number,
    expectedCakes: number,
    ivQuality: number,
  ) {
    this.states[index] = state;
    this.steps[index] = steps;
    this.expectedCakes[index] = expectedCakes;
    this.ivQualities[index] = ivQuality;
    this.positions[state] = index;
  }

  private compareAt(
    index: number,
    state: number,
    steps: number,
    expectedCakes: number,
    ivQuality: number,
  ) {
    return this.compareValues(
      this.states[index],
      this.steps[index],
      this.expectedCakes[index],
      this.ivQualities[index],
      state,
      steps,
      expectedCakes,
      ivQuality,
    );
  }

  private compareIndices(first: number, second: number) {
    return this.compareValues(
      this.states[first],
      this.steps[first],
      this.expectedCakes[first],
      this.ivQualities[first],
      this.states[second],
      this.steps[second],
      this.expectedCakes[second],
      this.ivQualities[second],
    );
  }

  private compareValues(
    firstState: number,
    firstSteps: number,
    firstExpectedCakes: number,
    firstIvQuality: number,
    secondState: number,
    secondSteps: number,
    secondExpectedCakes: number,
    secondIvQuality: number,
  ) {
    return compareLabels(
      firstSteps,
      firstExpectedCakes,
      stateExtraCount(firstState),
      secondSteps,
      secondExpectedCakes,
      stateExtraCount(secondState),
      this.objective,
      firstIvQuality,
      secondIvQuality,
      this.optimizeIvs,
    );
  }
}

function stateExtraCount(state: number) {
  return Math.floor(state / GENDER_VARIANTS) % EXTRA_VARIANTS;
}

function speciesGenderOffset(speciesIndex: number, gender: PalGender) {
  return speciesIndex * 2 + (gender === "M" ? 1 : 0);
}

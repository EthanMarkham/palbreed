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
import {
  estimateOffspringIvOutcome,
  getIvQualificationKey,
  meetsMinimumIv,
  normalizeMinimumIv,
  type IvScores,
} from "./ivProbability";
import { estimatePassiveOdds } from "./passiveProbability";

export type BuilderObjective = "recommended" | "fewest" | "cleanest" | "ivs";

export type BuilderIvScores = IvScores;

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
  resultIvScores?: BuilderIvScores;
  minimumIv?: number;
  ivOdds: number;
  odds: number;
  expectedCakes: number;
};

export type BuilderResult =
  | {
      status: "found";
      steps: readonly BuilderStep[];
      expectedCakes: number;
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
  minimumIv?: number;
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
};

type IvScoreArrays = {
  hp: Float64Array;
  attack: Float64Array;
  defense: Float64Array;
};

const MAX_PASSIVES = 4;
const EXTRA_VARIANTS = MAX_PASSIVES + 1;
const GENDER_VARIANTS = 3;
const ANY_GENDER_INDEX = 2;
const UNVISITED_PARENT = -0x80000000;
const UNREACHED_STEPS = 0xffff;
const MAX_CACHED_PARENT_UNION = MAX_PASSIVES * 3;
const ODDS_DIMENSION = MAX_PASSIVES + 1;
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
  const minimumIv = normalizeMinimumIv(input.minimumIv);
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

  const ownedTarget = encodedInventory.some(({ pal, requiredMask, extraCount, ivScores }) =>
    pal.speciesId === input.targetId
    && (acceptsAnyPassives || (requiredMask === fullMask && extraCount <= allowedExtras))
    && meetsMinimumIv(ivScores, minimumIv),
  );
  if (ownedTarget) return { status: "found", steps: [], expectedCakes: 0 };

  const targetIndex = getRuntimePalIndex(input.targetId);
  if (targetIndex === undefined) return noRoute();
  const targetPairings = getTargetPairings(input.targetId);

  const actionsBySpecies = buildPartnerActions(
    encodedInventory,
    maskVariants,
    acceptsAnyPassives,
    input.objective,
    minimumIv,
  );
  const stateCount = runtimePals.length * maskVariants * EXTRA_VARIANTS * GENDER_VARIANTS;
  const bestSteps = new Uint16Array(stateCount).fill(UNREACHED_STEPS);
  const bestExpectedCakes = new Float64Array(stateCount).fill(Number.POSITIVE_INFINITY);
  const bestIvScores = createIvScoreArrays(stateCount);
  const firstParentRef = new Int32Array(stateCount).fill(UNVISITED_PARENT);
  const secondParentRef = new Int32Array(stateCount).fill(UNVISITED_PARENT);
  const edgeOdds = new Float64Array(stateCount);
  const edgeIvOdds = new Float64Array(stateCount).fill(1);
  const settled = new Uint8Array(stateCount);
  const settledBySpeciesAndGender: number[][] = Array.from(
    { length: runtimePals.length * 2 },
    () => [],
  );
  const queue = new StatePriorityQueue(input.objective, stateCount, bestIvScores);
  const ivScoresFromRef = (ref: number) => ref < 0
    ? encodedInventory[decodeInventoryRef(ref)].ivScores
    : getStateIvScores(bestIvScores, ref);

  const recordFinalState = (
    maxUnknownExtraCount: number,
    odds: number,
    ivOdds: number,
    steps: number,
    expectedCakes: number,
    firstRef: number,
    secondRef: number,
    resultIvScores: BuilderIvScores | undefined,
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
      resultIvScores,
      bestSteps[state],
      bestExpectedCakes[state],
      maxUnknownExtraCount,
      getStateIvScores(bestIvScores, state),
      input.objective,
    ) >= 0) return;

    bestSteps[state] = nextSteps;
    bestExpectedCakes[state] = nextExpectedCakes;
    setStateIvScores(bestIvScores, state, resultIvScores);
    firstParentRef[state] = firstRef;
    secondParentRef[state] = secondRef;
    edgeOdds[state] = odds;
    edgeIvOdds[state] = ivOdds;
  };

  const relaxState = (
    childIndex: number,
    nextMask: number,
    maxUnknownExtraCount: number,
    gender: PalGender | undefined,
    odds: number,
    ivOdds: number,
    steps: number,
    expectedCakes: number,
    firstRef: number,
    secondRef: number,
    resultIvScores: BuilderIvScores | undefined,
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
      resultIvScores,
      bestSteps[state],
      bestExpectedCakes[state],
      maxUnknownExtraCount,
      getStateIvScores(bestIvScores, state),
      input.objective,
    ) >= 0) return;

    bestSteps[state] = steps;
    bestExpectedCakes[state] = expectedCakes;
    setStateIvScores(bestIvScores, state, resultIvScores);
    firstParentRef[state] = firstRef;
    secondParentRef[state] = secondRef;
    edgeOdds[state] = odds;
    edgeIvOdds[state] = ivOdds;
    queue.push(state, steps, expectedCakes);
  };

  const relaxHatchGenders = (
    childIndex: number,
    nextMask: number,
    maxUnknownExtraCount: number,
    passiveChance: number,
    ivChance: number,
    isFinalHatch: boolean,
    currentSteps: number,
    currentExpectedCakes: number,
    firstRef: number,
    secondRef: number,
    resultIvScores: BuilderIvScores | undefined,
  ) => {
    if (isFinalHatch) {
      recordFinalState(
        maxUnknownExtraCount,
        passiveChance * ivChance,
        ivChance,
        currentSteps,
        currentExpectedCakes,
        firstRef,
        secondRef,
        resultIvScores,
      );
      return;
    }

    for (const gender of ["F", "M"] as const) {
      const odds = passiveChance * ivChance * getPalGenderProbability(
        runtimePals[childIndex].id,
        gender,
      );
      relaxState(
        childIndex,
        nextMask,
        maxUnknownExtraCount,
        gender,
        odds,
        ivChance,
        currentSteps + 1,
        currentExpectedCakes + 1 / odds,
        firstRef,
        secondRef,
        resultIvScores,
      );
    }
  };

  const relaxOutcome = (
    childIndex: number,
    nextMask: number,
    parentUnionSize: number,
    currentSteps: number,
    currentExpectedCakes: number,
    firstRef: number,
    secondRef: number,
  ) => {
    const ivOutcome = estimateOffspringIvOutcome(
      ivScoresFromRef(firstRef),
      ivScoresFromRef(secondRef),
      minimumIv,
    );
    const desiredCount = countBits(nextMask);
    const availableExtraSlots = MAX_PASSIVES - desiredCount;
    const isFinalHatch = childIndex === targetIndex && nextMask === fullMask;
    if (acceptsAnyPassives) {
      relaxHatchGenders(
        childIndex,
        nextMask,
        0,
        1,
        ivOutcome.odds,
        isFinalHatch,
        currentSteps,
        currentExpectedCakes,
        firstRef,
        secondRef,
        ivOutcome.scores,
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
        ivOutcome.odds,
        isFinalHatch,
        currentSteps,
        currentExpectedCakes,
        firstRef,
        secondRef,
        ivOutcome.scores,
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
        getStateIvScores(bestIvScores, state),
        bestSteps[bestTargetState],
        bestExpectedCakes[bestTargetState],
        stateExtraCount(bestTargetState),
        getStateIvScores(bestIvScores, bestTargetState),
        input.objective,
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
          edgeIvOdds,
          bestIvScores,
          minimumIv,
        ),
        expectedCakes: bestExpectedCakes[bestTargetState],
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
  objective: BuilderObjective,
  minimumIv: number | undefined,
) {
  return runtimePals.map((_, firstParentIndex): readonly PartnerAction[] => {
    const bestPartnerByOutcome = new Map<number, number>();
    const ivVariants = minimumIv === undefined ? 1 : 9;

    for (let partnerIndex = 0; partnerIndex < inventory.length; partnerIndex += 1) {
      const partner = inventory[partnerIndex];
      if (partner.speciesIndex < 0) continue;
      const childIndex = getRuntimeChildIndex(
        firstParentIndex,
        partner.speciesIndex,
        partner.pal.gender,
      );
      if (childIndex < 0) continue;
      const actionKey = ((
        (childIndex * maskVariants + partner.requiredMask) * 2
        + (partner.pal.gender === "M" ? 1 : 0)
      ) * ivVariants) + getIvQualificationKey(partner.ivScores, minimumIv);
      const existingIndex = bestPartnerByOutcome.get(actionKey);
      if (existingIndex !== undefined) {
        const existing = inventory[existingIndex];
        const extraComparison = acceptsAnyPassives
          ? 0
          : existing.extraCount - partner.extraCount;
        const ivComparison = compareIvScores(existing.ivScores, partner.ivScores);
        const comparison = objective === "ivs"
          ? ivComparison || extraComparison
          : extraComparison || ivComparison;
        if (comparison <= 0) continue;
      }
      bestPartnerByOutcome.set(actionKey, partnerIndex);
    }

    return [...bestPartnerByOutcome].map(([actionKey, partnerIndex]) => ({
      childIndex: Math.floor(actionKey / (maskVariants * 2 * ivVariants)),
      partnerIndex,
    }));
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
  edgeIvOdds: Float64Array,
  ivScores: IvScoreArrays,
  minimumIv: number | undefined,
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
        ivScores,
      ),
      firstParentStepId,
      secondParent: createParentFromRef(
        secondRef,
        maskVariants,
        inventory,
        required,
        acceptsAnyPassives,
        firstParentRef,
        ivScores,
      ),
      secondParentStepId,
      result: runtimePals[resultState.speciesIndex].id,
      resultPassives,
      resultIvScores: getStateIvScores(ivScores, state),
      minimumIv,
      ivOdds: edgeIvOdds[state],
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
  ivScores: IvScoreArrays,
) {
  if (ref < 0) return createInventoryParent(inventory[decodeInventoryRef(ref)].pal);
  if (firstParentRef[ref] === UNVISITED_PARENT) {
    throw new Error("A planned breeding parent has no production step.");
  }
  return createPlannedParent(
    decodeState(ref, maskVariants),
    required,
    acceptsAnyPassives,
    getStateIvScores(ivScores, ref),
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
  ivScores: BuilderIvScores | undefined,
): BuilderParent {
  if (!state.gender) throw new Error("A planned breeding parent must have a gender.");
  return {
    speciesId: runtimePals[state.speciesIndex].id,
    origin: "planned",
    level: 1,
    gender: state.gender,
    ivScores,
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
  firstIvScores: BuilderIvScores | undefined,
  secondSteps: number,
  secondExpectedCakes: number,
  secondExtraCount: number,
  secondIvScores: BuilderIvScores | undefined,
  objective: BuilderObjective,
) {
  if (objective === "ivs") {
    return firstSteps - secondSteps
      || compareIvScores(firstIvScores, secondIvScores)
      || firstExpectedCakes - secondExpectedCakes
      || firstExtraCount - secondExtraCount;
  }
  if (objective === "cleanest") {
    return firstExpectedCakes - secondExpectedCakes
      || firstSteps - secondSteps
      || firstExtraCount - secondExtraCount
      || compareIvScores(firstIvScores, secondIvScores);
  }
  if (objective === "recommended") {
    return (firstExpectedCakes + firstSteps * 8) - (secondExpectedCakes + secondSteps * 8)
      || firstSteps - secondSteps
      || firstExpectedCakes - secondExpectedCakes
      || firstExtraCount - secondExtraCount
      || compareIvScores(firstIvScores, secondIvScores);
  }
  return firstSteps - secondSteps
    || firstExpectedCakes - secondExpectedCakes
    || firstExtraCount - secondExtraCount
    || compareIvScores(firstIvScores, secondIvScores);
}

function getInventoryIvScores(pal: OwnedPal): BuilderIvScores | undefined {
  if (!pal.abilityScores) return undefined;
  return {
    hp: pal.abilityScores.hp,
    attack: pal.abilityScores.ranged,
    defense: pal.abilityScores.defense,
  };
}

function compareIvScores(
  first: BuilderIvScores | undefined,
  second: BuilderIvScores | undefined,
) {
  if (!first || !second) return first ? -1 : second ? 1 : 0;
  return ivTotal(second) - ivTotal(first);
}

function ivTotal(scores: BuilderIvScores) {
  return scores.hp + scores.attack + scores.defense;
}

function createIvScoreArrays(stateCount: number): IvScoreArrays {
  return {
    hp: new Float64Array(stateCount).fill(Number.NaN),
    attack: new Float64Array(stateCount).fill(Number.NaN),
    defense: new Float64Array(stateCount).fill(Number.NaN),
  };
}

function getStateIvScores(
  scores: IvScoreArrays,
  state: number,
): BuilderIvScores | undefined {
  const hp = scores.hp[state];
  const attack = scores.attack[state];
  const defense = scores.defense[state];
  return Number.isNaN(hp) || Number.isNaN(attack) || Number.isNaN(defense)
    ? undefined
    : { hp, attack, defense };
}

function setStateIvScores(
  scores: IvScoreArrays,
  state: number,
  value: BuilderIvScores | undefined,
) {
  scores.hp[state] = value?.hp ?? Number.NaN;
  scores.attack[state] = value?.attack ?? Number.NaN;
  scores.defense[state] = value?.defense ?? Number.NaN;
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
  private readonly positions: Int32Array;

  constructor(
    private readonly objective: BuilderObjective,
    stateCount: number,
    private readonly ivScores: IvScoreArrays,
  ) {
    this.positions = new Int32Array(stateCount).fill(-1);
  }

  get size() {
    return this.states.length;
  }

  push(state: number, steps: number, expectedCakes: number) {
    const existingIndex = this.positions[state];
    if (existingIndex >= 0) {
      this.steps[existingIndex] = steps;
      this.expectedCakes[existingIndex] = expectedCakes;
      this.siftUp(existingIndex);
      return;
    }

    const index = this.states.length;
    this.states.push(state);
    this.steps.push(steps);
    this.expectedCakes.push(expectedCakes);
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
    };
    const tailState = this.states.pop();
    const tailSteps = this.steps.pop();
    const tailExpectedCakes = this.expectedCakes.pop();
    this.positions[firstState] = -1;

    if (
      this.states.length
      && tailState !== undefined
      && tailSteps !== undefined
      && tailExpectedCakes !== undefined
    ) {
      this.states[0] = tailState;
      this.steps[0] = tailSteps;
      this.expectedCakes[0] = tailExpectedCakes;
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
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compareAt(parent, state, steps, expectedCakes) <= 0) break;
      this.copyEntry(parent, index);
      index = parent;
    }
    this.setEntry(index, state, steps, expectedCakes);
  }

  private siftDown(startIndex: number) {
    let index = startIndex;
    const state = this.states[index];
    const steps = this.steps[index];
    const expectedCakes = this.expectedCakes[index];
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
        this.states[child],
        this.steps[child],
        this.expectedCakes[child],
      ) <= 0) break;
      this.copyEntry(child, index);
      index = child;
    }
    this.setEntry(index, state, steps, expectedCakes);
  }

  private copyEntry(from: number, to: number) {
    this.setEntry(
      to,
      this.states[from],
      this.steps[from],
      this.expectedCakes[from],
    );
  }

  private setEntry(index: number, state: number, steps: number, expectedCakes: number) {
    this.states[index] = state;
    this.steps[index] = steps;
    this.expectedCakes[index] = expectedCakes;
    this.positions[state] = index;
  }

  private compareAt(index: number, state: number, steps: number, expectedCakes: number) {
    return this.compareValues(
      this.states[index],
      this.steps[index],
      this.expectedCakes[index],
      state,
      steps,
      expectedCakes,
    );
  }

  private compareIndices(first: number, second: number) {
    return this.compareValues(
      this.states[first],
      this.steps[first],
      this.expectedCakes[first],
      this.states[second],
      this.steps[second],
      this.expectedCakes[second],
    );
  }

  private compareValues(
    firstState: number,
    firstSteps: number,
    firstExpectedCakes: number,
    secondState: number,
    secondSteps: number,
    secondExpectedCakes: number,
  ) {
    return compareLabels(
      firstSteps,
      firstExpectedCakes,
      stateExtraCount(firstState),
      getStateIvScores(this.ivScores, firstState),
      secondSteps,
      secondExpectedCakes,
      stateExtraCount(secondState),
      getStateIvScores(this.ivScores, secondState),
      this.objective,
    );
  }
}

function stateExtraCount(state: number) {
  return Math.floor(state / GENDER_VARIANTS) % EXTRA_VARIANTS;
}

function speciesGenderOffset(speciesIndex: number, gender: PalGender) {
  return speciesIndex * 2 + (gender === "M" ? 1 : 0);
}

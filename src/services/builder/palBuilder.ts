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
  createIvInheritanceOddsTable,
  getIvGoalDefinitions,
  getIvQualificationMask,
  ivGoalForMask,
  normalizeIvGoal,
  type IvGoal,
  type IvGoalDefinition,
  type IvScores,
  type IvStat,
} from "./ivProbability";
import { estimatePassiveOdds } from "./passiveProbability";

export type BuilderObjective = "recommended" | "fewest" | "cleanest";

export type BuilderIvScores = IvScores;
export type BuilderIvGoal = IvGoal;

export type BuilderParentPassives =
  | { kind: "known"; ids: readonly PassiveId[] }
  | { kind: "bounded"; ids: readonly PassiveId[]; maxExtras: number }
  | { kind: "any" };

type BuilderParentBase = {
  speciesId: PalId;
  gender: PalGender;
  passives: BuilderParentPassives;
  ivScores?: BuilderIvScores;
  ivRequirements?: BuilderIvGoal;
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
  resultIvRequirements?: BuilderIvGoal;
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
  | {
      status: "missing-ivs";
      missingIvStats: readonly IvStat[];
      ivGoal: BuilderIvGoal;
      reason: string;
    }
  | { status: "no-route"; reason: string };

export type BuilderInput = {
  inventory: readonly OwnedPal[];
  targetId: PalId;
  passiveGoal: PassiveGoal;
  objective: BuilderObjective;
  ivGoal?: BuilderIvGoal;
};

type EncodedOwnedPal = {
  pal: OwnedPal;
  speciesIndex: number;
  passiveIds: readonly PassiveId[];
  requiredMask: number;
  extraCount: number;
  ivMask: number;
};

type PartnerAction = {
  childIndex: number;
  partnerIndex: number;
};

type PartnerActionsByGender = readonly [
  readonly PartnerAction[],
  readonly PartnerAction[],
];

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

const MAX_PASSIVES = 4;
const EXTRA_VARIANTS = MAX_PASSIVES + 1;
const GENDER_VARIANTS = 3;
const ANY_GENDER_INDEX = 2;
const UNVISITED_PARENT = -0x80000000;
const UNREACHED_STEPS = 0xffff;
const MAX_CACHED_PARENT_UNION = MAX_PASSIVES * 3;
const ODDS_DIMENSION = MAX_PASSIVES + 1;
const passiveMaskBitCounts = new Uint8Array(1 << MAX_PASSIVES);
const hatchGenderOdds = new Float64Array(runtimePals.length * 2);
const passiveOdds = new Float64Array(
  (MAX_CACHED_PARENT_UNION + 1) * ODDS_DIMENSION * ODDS_DIMENSION,
);

for (let mask = 1; mask < passiveMaskBitCounts.length; mask += 1) {
  passiveMaskBitCounts[mask] = passiveMaskBitCounts[mask >> 1] + (mask & 1);
}

for (let speciesIndex = 0; speciesIndex < runtimePals.length; speciesIndex += 1) {
  hatchGenderOdds[speciesIndex * 2] = getPalGenderProbability(runtimePals[speciesIndex].id, "F");
  hatchGenderOdds[speciesIndex * 2 + 1] = getPalGenderProbability(
    runtimePals[speciesIndex].id,
    "M",
  );
}

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
  const ivGoal = normalizeIvGoal(input.ivGoal);
  const ivDefinitions = getIvGoalDefinitions(ivGoal);
  const fullIvMask = (1 << ivDefinitions.length) - 1;
  const ivVariants = 1 << ivDefinitions.length;
  const ivOddsByParentMasks = createIvInheritanceOddsTable(ivDefinitions);
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
      ivMask: getIvQualificationMask(getInventoryIvScores(pal), ivDefinitions),
    };
  });

  const availableIvMask = encodedInventory.reduce((mask, pal) => mask | pal.ivMask, 0);
  if (availableIvMask !== fullIvMask) {
    const missingIvStats = ivDefinitions
      .filter(({ bit }) => (availableIvMask & bit) === 0)
      .map(({ stat }) => stat);
    return {
      status: "missing-ivs",
      missingIvStats,
      ivGoal,
      reason: "This world doesn't have a known qualifying source for every hidden-stat target. Random-only mutation routes aren't proposed; add or hatch a Pal that meets each missing target, then try again.",
    };
  }

  const ownedTarget = encodedInventory.some(({ pal, requiredMask, extraCount, ivMask }) =>
    pal.speciesId === input.targetId
    && (acceptsAnyPassives || (requiredMask === fullMask && extraCount <= allowedExtras))
    && ivMask === fullIvMask,
  );
  if (ownedTarget) return { status: "found", steps: [], expectedCakes: 0 };

  const targetIndex = getRuntimePalIndex(input.targetId);
  if (targetIndex === undefined) return noRoute();
  const targetPairings = getTargetPairings(input.targetId);

  const actionsBySpecies = buildPartnerActions(
    encodedInventory,
    maskVariants,
    ivVariants,
    ivOddsByParentMasks,
    acceptsAnyPassives,
  );
  const stateCount = runtimePals.length
    * maskVariants
    * ivVariants
    * EXTRA_VARIANTS
    * GENDER_VARIANTS;
  const bestSteps = new Uint16Array(stateCount).fill(UNREACHED_STEPS);
  const bestExpectedCakes = new Float64Array(stateCount).fill(Number.POSITIVE_INFINITY);
  const firstParentRef = new Int32Array(stateCount).fill(UNVISITED_PARENT);
  const secondParentRef = new Int32Array(stateCount).fill(UNVISITED_PARENT);
  const edgeOdds = new Float64Array(stateCount);
  const settled = new Uint8Array(stateCount);
  const settledBySpeciesAndGender: number[][] = Array.from(
    { length: runtimePals.length * 2 },
    () => [],
  );
  const queue = new StatePriorityQueue(input.objective, stateCount);
  let bestTargetState: number | undefined;

  const recordFinalState = (
    maxUnknownExtraCount: number,
    odds: number,
    steps: number,
    expectedCakes: number,
    firstRef: number,
    secondRef: number,
  ) => {
    if (odds <= 0) return;
    const state = encodeState(
      targetIndex,
      fullMask,
      fullIvMask,
      maxUnknownExtraCount,
      undefined,
      maskVariants,
      ivVariants,
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
    ) >= 0) return;

    bestSteps[state] = nextSteps;
    bestExpectedCakes[state] = nextExpectedCakes;
    firstParentRef[state] = firstRef;
    secondParentRef[state] = secondRef;
    edgeOdds[state] = odds;
    if (
      bestTargetState === undefined
      || compareLabels(
        nextSteps,
        nextExpectedCakes,
        maxUnknownExtraCount,
        bestSteps[bestTargetState],
        bestExpectedCakes[bestTargetState],
        stateExtraCount(bestTargetState),
        input.objective,
      ) < 0
    ) bestTargetState = state;
  };

  const relaxState = (
    childIndex: number,
    nextMask: number,
    nextIvMask: number,
    maxUnknownExtraCount: number,
    gender: PalGender | undefined,
    odds: number,
    steps: number,
    expectedCakes: number,
    firstRef: number,
    secondRef: number,
  ) => {
    if (odds <= 0) return;
    for (let cleanerExtraCount = 0; cleanerExtraCount < maxUnknownExtraCount; cleanerExtraCount += 1) {
      const cleanerState = encodeState(
        childIndex,
        nextMask,
        nextIvMask,
        cleanerExtraCount,
        gender,
        maskVariants,
        ivVariants,
      );
      if (
        bestSteps[cleanerState] !== UNREACHED_STEPS
        && compareLabels(
          bestSteps[cleanerState],
          bestExpectedCakes[cleanerState],
          cleanerExtraCount,
          steps,
          expectedCakes,
          maxUnknownExtraCount,
          input.objective,
        ) <= 0
      ) return;
    }
    const state = encodeState(
      childIndex,
      nextMask,
      nextIvMask,
      maxUnknownExtraCount,
      gender,
      maskVariants,
      ivVariants,
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
    ) >= 0) return;

    bestSteps[state] = steps;
    bestExpectedCakes[state] = expectedCakes;
    firstParentRef[state] = firstRef;
    secondParentRef[state] = secondRef;
    edgeOdds[state] = odds;
    for (
      let dirtierExtraCount = maxUnknownExtraCount + 1;
      dirtierExtraCount <= MAX_PASSIVES;
      dirtierExtraCount += 1
    ) {
      const dirtierState = encodeState(
        childIndex,
        nextMask,
        nextIvMask,
        dirtierExtraCount,
        gender,
        maskVariants,
        ivVariants,
      );
      if (
        !settled[dirtierState]
        && bestSteps[dirtierState] !== UNREACHED_STEPS
        && compareLabels(
          steps,
          expectedCakes,
          maxUnknownExtraCount,
          bestSteps[dirtierState],
          bestExpectedCakes[dirtierState],
          dirtierExtraCount,
          input.objective,
        ) <= 0
      ) {
        settled[dirtierState] = 1;
      }
    }
    queue.push(state, steps, expectedCakes);
  };

  const relaxHatchGenders = (
    childIndex: number,
    nextMask: number,
    nextIvMask: number,
    maxUnknownExtraCount: number,
    passiveChance: number,
    ivChance: number,
    isFinalHatch: boolean,
    currentSteps: number,
    currentExpectedCakes: number,
    firstRef: number,
    secondRef: number,
  ) => {
    if (isFinalHatch) {
      recordFinalState(
        maxUnknownExtraCount,
        passiveChance * ivChance,
        currentSteps,
        currentExpectedCakes,
        firstRef,
        secondRef,
      );
      return;
    }

    for (const gender of ["F", "M"] as const) {
      const odds = passiveChance * ivChance * hatchGenderOdds[
        childIndex * 2 + (gender === "M" ? 1 : 0)
      ];
      relaxState(
        childIndex,
        nextMask,
        nextIvMask,
        maxUnknownExtraCount,
        gender,
        odds,
        currentSteps + 1,
        currentExpectedCakes + 1 / odds,
        firstRef,
        secondRef,
      );
    }
  };

  const relaxOutcome = (
    childIndex: number,
    nextMask: number,
    firstIvMask: number,
    secondIvMask: number,
    parentUnionSize: number,
    currentSteps: number,
    currentExpectedCakes: number,
    firstRef: number,
    secondRef: number,
  ) => {
    const nextIvMask = firstIvMask | secondIvMask;
    const ivChance = ivOddsByParentMasks[firstIvMask * ivVariants + secondIvMask];
    const desiredCount = countBits(nextMask);
    const availableExtraSlots = MAX_PASSIVES - desiredCount;
    const isFinalHatch = childIndex === targetIndex
      && nextMask === fullMask
      && nextIvMask === fullIvMask;
    if (acceptsAnyPassives) {
      relaxHatchGenders(
        childIndex,
        nextMask,
        nextIvMask,
        0,
        1,
        ivChance,
        isFinalHatch,
        currentSteps,
        currentExpectedCakes,
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
        nextIvMask,
        acceptedExtras,
        passiveChance,
        ivChance,
        isFinalHatch,
        currentSteps,
        currentExpectedCakes,
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
        first.ivMask,
        second.ivMask,
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

    const decoded = decodeState(current.state, maskVariants, ivVariants);
    settled[current.state] = 1;
    if (decoded.gender !== undefined) {
      settledBySpeciesAndGender[
        speciesGenderOffset(decoded.speciesIndex, decoded.gender)
      ].push(current.state);
    }
    const partnerGenderIndex = decoded.gender === "F" ? 1 : 0;
    for (const action of actionsBySpecies[decoded.speciesIndex][decoded.ivMask][partnerGenderIndex]) {
      const partner = encodedInventory[action.partnerIndex];
      const nextMask = decoded.mask | partner.requiredMask;
      relaxOutcome(
        action.childIndex,
        nextMask,
        decoded.ivMask,
        partner.ivMask,
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

  const joinBucketsByGroup = new Map<readonly number[], readonly number[][]>();
  const getJoinBuckets = (states: readonly number[]) => {
    const existing = joinBucketsByGroup.get(states);
    if (existing) return existing;
    const buckets: number[][] = Array.from({ length: maskVariants * ivVariants }, () => []);
    for (const state of states) {
      const decoded = decodeState(state, maskVariants, ivVariants);
      buckets[decoded.mask * ivVariants + decoded.ivMask].push(state);
    }
    joinBucketsByGroup.set(states, buckets);
    return buckets;
  };

  const combineGroups = (firstStates: readonly number[], secondStates: readonly number[]) => {
    const secondBuckets = getJoinBuckets(secondStates);
    for (const firstState of firstStates) {
      const first = decodeState(firstState, maskVariants, ivVariants);
      const missingPassiveMask = fullMask & ~first.mask;
      const optionalPassiveMask = fullMask & ~missingPassiveMask;
      const missingIvMask = fullIvMask & ~first.ivMask;
      const optionalIvMask = fullIvMask & ~missingIvMask;

      forEachSubmask(optionalPassiveMask, (passiveAddition) => {
        const secondPassiveMask = missingPassiveMask | passiveAddition;
        forEachSubmask(optionalIvMask, (ivAddition) => {
          const secondIvMask = missingIvMask | ivAddition;
          const bucket = secondBuckets[secondPassiveMask * ivVariants + secondIvMask];
          for (const secondState of bucket) {
            relaxOutcome(
              targetIndex,
              fullMask,
              first.ivMask,
              secondIvMask,
              acceptsAnyPassives
                ? 0
                : required.length
                  + first.maxUnknownExtraCount
                  + stateExtraCount(secondState),
              bestSteps[firstState] + bestSteps[secondState],
              bestExpectedCakes[firstState] + bestExpectedCakes[secondState],
              firstState,
              secondState,
            );
          }
        });
      });
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

  return bestTargetState === undefined
    ? noRoute()
    : {
        status: "found",
        steps: reconstruct(
          bestTargetState,
          maskVariants,
          ivVariants,
          encodedInventory,
          required,
          ivDefinitions,
          acceptsAnyPassives,
          firstParentRef,
          secondParentRef,
          edgeOdds,
          ivOddsByParentMasks,
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
  ivVariants: number,
  ivOddsByParentMasks: Float64Array,
  acceptsAnyPassives: boolean,
) {
  return runtimePals.map((_, firstParentIndex): readonly PartnerActionsByGender[] => (
    Array.from({ length: ivVariants }, (_, firstIvMask) => {
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
        const nextIvMask = firstIvMask | partner.ivMask;
        const actionKey = (((
          childIndex * maskVariants + partner.requiredMask
        ) * ivVariants + nextIvMask) * 2) + (partner.pal.gender === "M" ? 1 : 0);
        const existingIndices = bestPartnersByOutcome.get(actionKey) ?? [];
        const partnerIvOdds = ivOddsByParentMasks[firstIvMask * ivVariants + partner.ivMask];
        const isDominated = existingIndices.some((existingIndex) => {
          const existing = inventory[existingIndex];
          return (acceptsAnyPassives || existing.extraCount <= partner.extraCount)
            && ivOddsByParentMasks[firstIvMask * ivVariants + existing.ivMask] >= partnerIvOdds;
        });
        if (isDominated) continue;

        bestPartnersByOutcome.set(
          actionKey,
          existingIndices.filter((existingIndex) => {
            const existing = inventory[existingIndex];
            return (!acceptsAnyPassives && partner.extraCount > existing.extraCount)
              || partnerIvOdds
                < ivOddsByParentMasks[firstIvMask * ivVariants + existing.ivMask];
          }).concat(partnerIndex),
        );
      }

      const actionsByGender: [PartnerAction[], PartnerAction[]] = [[], []];
      for (const [actionKey, partnerIndices] of bestPartnersByOutcome) {
        const childIndex = Math.floor(actionKey / (maskVariants * ivVariants * 2));
        for (const partnerIndex of partnerIndices) {
          const genderIndex = inventory[partnerIndex].pal.gender === "M" ? 1 : 0;
          actionsByGender[genderIndex].push({ childIndex, partnerIndex });
        }
      }
      return actionsByGender;
    })
  ));
}

function reconstruct(
  targetState: number,
  maskVariants: number,
  ivVariants: number,
  inventory: readonly EncodedOwnedPal[],
  required: readonly PassiveId[],
  ivDefinitions: readonly IvGoalDefinition[],
  acceptsAnyPassives: boolean,
  firstParentRef: Int32Array,
  secondParentRef: Int32Array,
  edgeOdds: Float64Array,
  ivOddsByParentMasks: Float64Array,
) {
  const steps: BuilderStep[] = [];
  const ivMaskFromRef = (ref: number) => ref < 0
    ? inventory[decodeInventoryRef(ref)].ivMask
    : decodeState(ref, maskVariants, ivVariants).ivMask;
  const appendState = (state: number): string => {
    const firstRef = firstParentRef[state];
    const secondRef = secondParentRef[state];
    if (firstRef === UNVISITED_PARENT || secondRef === UNVISITED_PARENT) {
      throw new Error("A planned breeding step is missing its parents.");
    }
    const firstParentStepId = firstRef >= 0 ? appendState(firstRef) : undefined;
    const secondParentStepId = secondRef >= 0 ? appendState(secondRef) : undefined;

    const resultState = decodeState(state, maskVariants, ivVariants);
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
        ivVariants,
        inventory,
        required,
        ivDefinitions,
        acceptsAnyPassives,
        firstParentRef,
      ),
      firstParentStepId,
      secondParent: createParentFromRef(
        secondRef,
        maskVariants,
        ivVariants,
        inventory,
        required,
        ivDefinitions,
        acceptsAnyPassives,
        firstParentRef,
      ),
      secondParentStepId,
      result: runtimePals[resultState.speciesIndex].id,
      resultPassives,
      resultIvRequirements: ivGoalForMask(resultState.ivMask, ivDefinitions),
      ivOdds: ivOddsByParentMasks[
        ivMaskFromRef(firstRef) * ivVariants + ivMaskFromRef(secondRef)
      ],
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
  ivVariants: number,
  inventory: readonly EncodedOwnedPal[],
  required: readonly PassiveId[],
  ivDefinitions: readonly IvGoalDefinition[],
  acceptsAnyPassives: boolean,
  firstParentRef: Int32Array,
) {
  if (ref < 0) return createInventoryParent(inventory[decodeInventoryRef(ref)].pal);
  if (firstParentRef[ref] === UNVISITED_PARENT) {
    throw new Error("A planned breeding parent has no production step.");
  }
  return createPlannedParent(
    decodeState(ref, maskVariants, ivVariants),
    required,
    ivDefinitions,
    acceptsAnyPassives,
  );
}

function createPlannedParent(
  state: {
    speciesIndex: number;
    mask: number;
    ivMask: number;
    maxUnknownExtraCount: number;
    gender: PalGender | undefined;
  },
  required: readonly PassiveId[],
  ivDefinitions: readonly IvGoalDefinition[],
  acceptsAnyPassives: boolean,
): BuilderParent {
  if (!state.gender) throw new Error("A planned breeding parent must have a gender.");
  return {
    speciesId: runtimePals[state.speciesIndex].id,
    origin: "planned",
    level: 1,
    gender: state.gender,
    ivRequirements: ivGoalForMask(state.ivMask, ivDefinitions),
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
) {
  if (objective === "cleanest") {
    return firstExpectedCakes - secondExpectedCakes
      || firstSteps - secondSteps
      || firstExtraCount - secondExtraCount;
  }
  if (objective === "recommended") {
    return (firstExpectedCakes + firstSteps * 8) - (secondExpectedCakes + secondSteps * 8)
      || firstSteps - secondSteps
      || firstExpectedCakes - secondExpectedCakes
      || firstExtraCount - secondExtraCount;
  }
  return firstSteps - secondSteps
    || firstExpectedCakes - secondExpectedCakes
    || firstExtraCount - secondExtraCount;
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
  return passiveMaskBitCounts[value] ?? 0;
}

function encodeState(
  speciesIndex: number,
  mask: number,
  ivMask: number,
  maxUnknownExtraCount: number,
  gender: PalGender | undefined,
  maskVariants: number,
  ivVariants: number,
) {
  return (
    (((speciesIndex * maskVariants + mask) * ivVariants + ivMask)
      * EXTRA_VARIANTS + maxUnknownExtraCount)
    * GENDER_VARIANTS
  ) + encodeGender(gender);
}

function decodeState(state: number, maskVariants: number, ivVariants: number) {
  const genderIndex = state % GENDER_VARIANTS;
  const withoutGender = (state - genderIndex) / GENDER_VARIANTS;
  const maxUnknownExtraCount = withoutGender % EXTRA_VARIANTS;
  const withoutExtras = (withoutGender - maxUnknownExtraCount) / EXTRA_VARIANTS;
  const ivMask = withoutExtras % ivVariants;
  const withoutIvMask = (withoutExtras - ivMask) / ivVariants;
  const mask = withoutIvMask % maskVariants;
  return {
    speciesIndex: (withoutIvMask - mask) / maskVariants,
    mask,
    ivMask,
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
      secondSteps,
      secondExpectedCakes,
      stateExtraCount(secondState),
      this.objective,
    );
  }
}

function stateExtraCount(state: number) {
  return Math.floor(state / GENDER_VARIANTS) % EXTRA_VARIANTS;
}

function forEachSubmask(mask: number, visit: (submask: number) => void) {
  let submask = mask;
  while (true) {
    visit(submask);
    if (submask === 0) return;
    submask = (submask - 1) & mask;
  }
}

function speciesGenderOffset(speciesIndex: number, gender: PalGender) {
  return speciesIndex * 2 + (gender === "M" ? 1 : 0);
}

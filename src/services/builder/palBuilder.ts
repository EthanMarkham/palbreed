import {
  getRuntimeChildIndex,
  getRuntimePalIndex,
  runtimePals,
} from "../../data/breedingRuntime";
import { getPalGenderProbability } from "../../data/palStatsRepository";
import type { OwnedPal } from "../../domain/inventory";
import type { PalGender, PalId } from "../../domain/pal";
import type { PassiveGoal, PassiveId } from "../../domain/passive";
import { estimatePassiveOdds } from "./passiveProbability";

export type BuilderObjective = "recommended" | "fewest" | "cleanest";

export type BuilderParentPassives =
  | { kind: "known"; ids: readonly PassiveId[] }
  | { kind: "bounded"; ids: readonly PassiveId[]; maxExtras: number }
  | { kind: "any" };

type BuilderParentBase = {
  speciesId: PalId;
  gender: PalGender;
  passives: BuilderParentPassives;
};

export type BuilderParent =
  | BuilderParentBase & { origin: "inventory"; level?: number }
  | BuilderParentBase & { origin: "planned"; level: 1 };

export type BuilderStep = {
  firstParent: BuilderParent;
  secondParent: BuilderParent;
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
};

type PartnerAction = {
  childIndex: number;
  partnerIndex: number;
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
    };
  });

  const ownedTarget = encodedInventory.some(({ pal, requiredMask, extraCount }) =>
    pal.speciesId === input.targetId
    && (acceptsAnyPassives || (requiredMask === fullMask && extraCount <= allowedExtras)),
  );
  if (ownedTarget) return { status: "found", steps: [], expectedCakes: 0 };

  const targetIndex = getRuntimePalIndex(input.targetId);
  if (targetIndex === undefined) return noRoute();

  const actionsBySpecies = buildPartnerActions(
    encodedInventory,
    maskVariants,
    acceptsAnyPassives,
  );
  const stateCount = runtimePals.length * maskVariants * EXTRA_VARIANTS * GENDER_VARIANTS;
  const bestSteps = new Uint16Array(stateCount).fill(UNREACHED_STEPS);
  const bestExpectedCakes = new Float64Array(stateCount).fill(Number.POSITIVE_INFINITY);
  const firstParentRef = new Int32Array(stateCount).fill(UNVISITED_PARENT);
  const secondParentRef = new Int32Array(stateCount).fill(UNVISITED_PARENT);
  const edgeOdds = new Float64Array(stateCount);
  const settled = new Uint8Array(stateCount);
  const settledByGender: [number[], number[]] = [[], []];
  const queue = new StatePriorityQueue(input.objective);

  const relaxState = (
    childIndex: number,
    nextMask: number,
    maxUnknownExtraCount: number,
    gender: PalGender | undefined,
    odds: number,
    steps: number,
    expectedCakes: number,
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
    ) >= 0) return;

    bestSteps[state] = steps;
    bestExpectedCakes[state] = expectedCakes;
    firstParentRef[state] = firstRef;
    secondParentRef[state] = secondRef;
    edgeOdds[state] = odds;
    queue.push(state, steps, expectedCakes);
  };

  const relaxHatchGenders = (
    childIndex: number,
    nextMask: number,
    maxUnknownExtraCount: number,
    passiveChance: number,
    isFinalHatch: boolean,
    currentSteps: number,
    currentExpectedCakes: number,
    firstRef: number,
    secondRef: number,
  ) => {
    if (isFinalHatch) {
      relaxState(
        childIndex,
        nextMask,
        maxUnknownExtraCount,
        undefined,
        passiveChance,
        currentSteps + 1,
        currentExpectedCakes + 1 / passiveChance,
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
    firstRef: number,
    secondRef: number,
  ) => {
    const desiredCount = countBits(nextMask);
    const availableExtraSlots = MAX_PASSIVES - desiredCount;
    const isFinalHatch = childIndex === targetIndex && nextMask === fullMask;
    if (acceptsAnyPassives) {
      relaxHatchGenders(
        childIndex,
        nextMask,
        0,
        1,
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
        acceptedExtras,
        passiveChance,
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
    if (
      decoded.speciesIndex === targetIndex
      && decoded.mask === fullMask
      && decoded.maxUnknownExtraCount <= allowedExtras
    ) {
      return {
        status: "found",
        steps: reconstruct(
          current.state,
          maskVariants,
          encodedInventory,
          required,
          acceptsAnyPassives,
          firstParentRef,
          secondParentRef,
          edgeOdds,
        ),
        expectedCakes: current.expectedCakes,
      };
    }

    settled[current.state] = 1;
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

    if (decoded.gender !== undefined) {
      const oppositeGenderIndex = decoded.gender === "F" ? 1 : 0;
      for (const otherState of settledByGender[oppositeGenderIndex]) {
        const other = decodeState(otherState, maskVariants);
        if (!other.gender) continue;
        const childIndex = getRuntimeChildIndex(
          decoded.speciesIndex,
          other.speciesIndex,
          other.gender,
        );
        if (childIndex < 0) continue;
        const nextMask = decoded.mask | other.mask;
        relaxOutcome(
          childIndex,
          nextMask,
          acceptsAnyPassives
            ? 0
            : countBits(nextMask)
              + decoded.maxUnknownExtraCount
              + other.maxUnknownExtraCount,
          current.steps + bestSteps[otherState],
          current.expectedCakes + bestExpectedCakes[otherState],
          current.state,
          otherState,
        );
      }
      settledByGender[decoded.gender === "F" ? 0 : 1].push(current.state);
    }
  }

  return noRoute();
}

function buildPartnerActions(
  inventory: readonly EncodedOwnedPal[],
  maskVariants: number,
  acceptsAnyPassives: boolean,
) {
  return runtimePals.map((_, firstParentIndex): readonly PartnerAction[] => {
    const bestPartnerByOutcome = new Map<number, number>();

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
      const existingIndex = bestPartnerByOutcome.get(actionKey);
      if (
        existingIndex !== undefined
        && (acceptsAnyPassives || inventory[existingIndex].extraCount <= partner.extraCount)
      ) continue;
      bestPartnerByOutcome.set(actionKey, partnerIndex);
    }

    return [...bestPartnerByOutcome].map(([actionKey, partnerIndex]) => ({
      childIndex: Math.floor(actionKey / (maskVariants * 2)),
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
) {
  const steps: BuilderStep[] = [];
  const appendState = (state: number) => {
    const firstRef = firstParentRef[state];
    const secondRef = secondParentRef[state];
    if (firstRef === UNVISITED_PARENT || secondRef === UNVISITED_PARENT) {
      throw new Error("A planned breeding step is missing its parents.");
    }
    if (firstRef >= 0) appendState(firstRef);
    if (secondRef >= 0) appendState(secondRef);

    const resultState = decodeState(state, maskVariants);
    const resultPassives = passivesForState(
      resultState.mask,
      resultState.maxUnknownExtraCount,
      required,
      acceptsAnyPassives,
    );
    const odds = edgeOdds[state];
    steps.push({
      firstParent: createParentFromRef(
        firstRef,
        maskVariants,
        inventory,
        required,
        acceptsAnyPassives,
        firstParentRef,
      ),
      secondParent: createParentFromRef(
        secondRef,
        maskVariants,
        inventory,
        required,
        acceptsAnyPassives,
        firstParentRef,
      ),
      result: runtimePals[resultState.speciesIndex].id,
      resultPassives,
      odds,
      expectedCakes: 1 / odds,
    });
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
    passives: { kind: "known", ids: [...new Set(pal.passiveIds)] },
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

  constructor(private readonly objective: BuilderObjective) {}

  get size() {
    return this.states.length;
  }

  push(state: number, steps: number, expectedCakes: number) {
    let index = this.states.length;
    this.states.push(state);
    this.steps.push(steps);
    this.expectedCakes.push(expectedCakes);

    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compareAt(parent, state, steps, expectedCakes) <= 0) break;
      this.states[index] = this.states[parent];
      this.steps[index] = this.steps[parent];
      this.expectedCakes[index] = this.expectedCakes[parent];
      index = parent;
    }
    this.states[index] = state;
    this.steps[index] = steps;
    this.expectedCakes[index] = expectedCakes;
  }

  pop(): QueueEntry | undefined {
    if (!this.states.length) return undefined;
    const first = {
      state: this.states[0],
      steps: this.steps[0],
      expectedCakes: this.expectedCakes[0],
    };
    const tailState = this.states.pop();
    const tailSteps = this.steps.pop();
    const tailExpectedCakes = this.expectedCakes.pop();

    if (
      this.states.length
      && tailState !== undefined
      && tailSteps !== undefined
      && tailExpectedCakes !== undefined
    ) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= this.states.length) break;
        const right = left + 1;
        const child = right < this.states.length && this.compareIndices(right, left) < 0
          ? right
          : left;
        if (this.compareValues(
          tailState,
          tailSteps,
          tailExpectedCakes,
          this.states[child],
          this.steps[child],
          this.expectedCakes[child],
        ) <= 0) break;
        this.states[index] = this.states[child];
        this.steps[index] = this.steps[child];
        this.expectedCakes[index] = this.expectedCakes[child];
        index = child;
      }
      this.states[index] = tailState;
      this.steps[index] = tailSteps;
      this.expectedCakes[index] = tailExpectedCakes;
    }
    return first;
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

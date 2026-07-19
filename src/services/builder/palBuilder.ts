import { breedingRepository } from "../../data/breedingRepository";
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

type State = {
  key: string;
  speciesId: PalId;
  gender?: PalGender;
  mask: number;
  carriedPassiveIds: readonly PassiveId[];
  // A bounded hatch accepts cleaner results too, but downstream estimates use
  // the upper bound so the route never assumes that an unknown extra vanished.
  maxUnknownExtraCount: number;
  displayPassives: BuilderParentPassives;
  level?: number;
  extraCount: number;
  sourceOwnedPalId: string;
  steps: number;
  expectedCakes: number;
};

type Previous = { key: string; step: BuilderStep };

const MAX_PASSIVES = 4;
const MAX_INTERMEDIATE_EXTRAS = 1;

export function buildPal(input: {
  inventory: readonly OwnedPal[];
  targetId: PalId;
  passiveGoal: PassiveGoal;
  objective: BuilderObjective;
}): BuilderResult {
  const inventory = input.inventory;
  const acceptsAnyPassives = input.passiveGoal.kind === "any";
  const required: PassiveId[] = input.passiveGoal.kind === "any"
    ? []
    : [...new Set(input.passiveGoal.requiredIds)].slice(0, 4);
  const allowedExtras = input.passiveGoal.kind === "any" ? 4 : input.passiveGoal.allowedExtras;
  const available = new Set(inventory.flatMap(({ passiveIds }) => passiveIds));
  const missing = required.filter((id) => !available.has(id));
  if (missing.length) {
    return {
      status: "missing-passives",
      missingPassiveIds: missing,
      reason: "The inventory does not contain every requested passive yet. Add one carrier for each missing passive, then re-run the build.",
    };
  }
  if (!inventory.length) return { status: "no-route", reason: "Import a world before building." };

  const fullMask = (1 << required.length) - 1;
  const queue = new MinPriorityQueue<State>((first, second) => compareState(first, second, input.objective));
  const best = new Map<string, State>();
  const previous = new Map<string, Previous>();

  for (const pal of inventory) {
    const carriedPassiveIds = acceptsAnyPassives ? [] : [...new Set(pal.passiveIds)];
    const state = createState({
      speciesId: pal.speciesId,
      gender: pal.gender,
      level: pal.level,
      mask: maskFor(carriedPassiveIds, required),
      carriedPassiveIds,
      maxUnknownExtraCount: 0,
      displayPassives: { kind: "known", ids: [...new Set(pal.passiveIds)] },
      sourceOwnedPalId: pal.id,
      steps: 0,
      expectedCakes: 0,
      required,
    });
    const existing = best.get(state.key);
    if (!existing || compareState(state, existing, input.objective) < 0) {
      best.set(state.key, state);
      queue.push(state);
    }
  }

  while (queue.size) {
    const current = queue.pop();
    if (!current || best.get(current.key) !== current) continue;
    if (
      current.speciesId === input.targetId
      && current.mask === fullMask
      && current.extraCount <= allowedExtras
    ) {
      const steps = reconstruct(current.key, previous);
      return {
        status: "found",
        steps,
        expectedCakes: current.expectedCakes,
      };
    }

    for (const partner of inventory) {
      if (current.steps === 0 && partner.id === current.sourceOwnedPalId) continue;
      const nextMask = current.mask | maskFor(partner.passiveIds, required);
      for (const outcome of breedingRepository.getOutcomes(current.speciesId, partner.speciesId)) {
        const specialGenderRequirement = breedingRepository.getGenderRequirement(
          current.speciesId,
          partner.speciesId,
          outcome.childId,
        );
        const firstParentGender = specialGenderRequirement?.firstGender ?? oppositeGender(partner.gender);
        const secondParentGender = specialGenderRequirement?.secondGender ?? partner.gender;
        if (current.gender && firstParentGender !== current.gender) continue;
        if (secondParentGender !== partner.gender) continue;

        const desiredIds = passiveIdsFor(nextMask, required);
        const parentUnion = new Set([
          ...current.carriedPassiveIds,
          ...partner.passiveIds,
        ]);
        const isFinalHatch = outcome.childId === input.targetId && nextMask === fullMask;
        const passiveCandidates = getPassiveCandidates({
          acceptsAnyPassives,
          parentUnionSize: parentUnion.size + current.maxUnknownExtraCount,
          desiredIds,
          isFinalHatch,
          allowedFinalExtras: allowedExtras,
        });

        for (const candidate of passiveCandidates) {
          const edgeCakes = 1 / candidate.odds;
          const next = createState({
            speciesId: outcome.childId,
            level: 1,
            mask: nextMask,
            carriedPassiveIds: desiredIds,
            maxUnknownExtraCount: candidate.maxExtras,
            displayPassives: candidate.displayPassives,
            sourceOwnedPalId: current.sourceOwnedPalId,
            steps: current.steps + 1,
            expectedCakes: current.expectedCakes + edgeCakes,
            required,
          });
          const existing = best.get(next.key);
          if (existing && compareState(next, existing, input.objective) >= 0) continue;
          best.set(next.key, next);
          previous.set(next.key, {
            key: current.key,
            step: {
              firstParent: createCurrentParent(current, firstParentGender),
              secondParent: createInventoryParent(partner, secondParentGender),
              result: outcome.childId,
              resultPassives: next.displayPassives,
              odds: candidate.odds,
              expectedCakes: edgeCakes,
            },
          });
          queue.push(next);
        }
      }
    }
  }

  return {
    status: "no-route",
    reason: "No continuous carrier build can reach that species and passive set with the imported Pals and gender constraints.",
  };
}

function createState(input: {
  speciesId: PalId;
  gender?: PalGender;
  level?: number;
  mask: number;
  carriedPassiveIds: readonly PassiveId[];
  maxUnknownExtraCount: number;
  displayPassives: BuilderParentPassives;
  sourceOwnedPalId: string;
  steps: number;
  expectedCakes: number;
  required: readonly PassiveId[];
}): State {
  const {
    speciesId,
    gender,
    level,
    mask,
    carriedPassiveIds,
    maxUnknownExtraCount,
    displayPassives,
    sourceOwnedPalId,
    steps,
    expectedCakes,
    required,
  } = input;
  const normalizedPassives = [...new Set(carriedPassiveIds)].sort();
  const requiredSet = new Set(required);
  const knownExtraCount = normalizedPassives.filter((id) => !requiredSet.has(id)).length;
  const extraCount = knownExtraCount + maxUnknownExtraCount;
  return {
    key: `${speciesId}|${gender ?? "*"}|${mask}|${normalizedPassives.join(",")}|${maxUnknownExtraCount}`,
    speciesId,
    gender,
    mask,
    carriedPassiveIds: normalizedPassives,
    maxUnknownExtraCount,
    displayPassives,
    level,
    extraCount,
    sourceOwnedPalId,
    steps,
    expectedCakes,
  };
}

function getPassiveCandidates(input: {
  acceptsAnyPassives: boolean;
  parentUnionSize: number;
  desiredIds: readonly PassiveId[];
  isFinalHatch: boolean;
  allowedFinalExtras: number;
}) {
  if (input.acceptsAnyPassives) {
    return [{
      odds: estimatePassiveOdds(input.parentUnionSize, { kind: "any" }),
      maxExtras: 0,
      displayPassives: { kind: "any" } as const,
    }];
  }

  const maxExtras = input.isFinalHatch
    ? input.allowedFinalExtras
    : Math.min(MAX_INTERMEDIATE_EXTRAS, MAX_PASSIVES - input.desiredIds.length);
  const extraLimits = input.isFinalHatch
    ? [maxExtras]
    : Array.from({ length: maxExtras + 1 }, (_, index) => index);
  const candidates: Array<{
    odds: number;
    maxExtras: number;
    displayPassives: BuilderParentPassives;
  }> = [];
  let previousOdds = 0;

  for (const acceptedExtras of extraLimits) {
    const odds = estimatePassiveOdds(
      input.parentUnionSize,
      { kind: "specific", desiredCount: input.desiredIds.length, allowedExtras: acceptedExtras },
    );
    if (odds <= previousOdds) continue;
    previousOdds = odds;
    candidates.push({
      odds,
      maxExtras: acceptedExtras,
      displayPassives: acceptedExtras === 0
        ? { kind: "known", ids: input.desiredIds }
        : { kind: "bounded", ids: input.desiredIds, maxExtras: acceptedExtras },
    });
  }

  return candidates;
}

function compareState(first: State, second: State, objective: BuilderObjective) {
  if (objective === "cleanest") {
    return first.expectedCakes - second.expectedCakes
      || first.steps - second.steps
      || first.extraCount - second.extraCount;
  }
  if (objective === "recommended") {
    // One extra generation has meaningful setup/incubation cost, but can still
    // win when it removes enough low-odds hatches. The score stays additive,
    // so the priority search retains its optimality guarantee.
    const firstScore = first.expectedCakes + first.steps * 8;
    const secondScore = second.expectedCakes + second.steps * 8;
    return firstScore - secondScore
      || first.steps - second.steps
      || first.expectedCakes - second.expectedCakes
      || first.extraCount - second.extraCount;
  }
  return first.steps - second.steps
    || first.expectedCakes - second.expectedCakes
    || first.extraCount - second.extraCount;
}

function maskFor(ids: readonly PassiveId[], required: readonly PassiveId[]) {
  return required.reduce((mask, id, index) => ids.includes(id) ? mask | (1 << index) : mask, 0);
}

function passiveIdsFor(mask: number, required: readonly PassiveId[]) {
  return required.filter((_, index) => (mask & (1 << index)) !== 0);
}

function oppositeGender(gender: PalGender): PalGender {
  return gender === "F" ? "M" : "F";
}

function createCurrentParent(state: State, gender: PalGender): BuilderParent {
  const parent = {
    speciesId: state.speciesId,
    gender,
    passives: state.displayPassives,
  };
  return state.steps === 0
    ? { ...parent, origin: "inventory", level: state.level }
    : { ...parent, origin: "planned", level: 1 };
}

function createInventoryParent(pal: OwnedPal, gender: PalGender): BuilderParent {
  return {
    speciesId: pal.speciesId,
    origin: "inventory",
    level: pal.level,
    gender,
    passives: { kind: "known", ids: [...new Set(pal.passiveIds)] },
  };
}

function reconstruct(targetKey: string, previous: ReadonlyMap<string, Previous>) {
  const steps: BuilderStep[] = [];
  let key = targetKey;
  while (previous.has(key)) {
    const edge = previous.get(key);
    if (!edge) break;
    steps.push(edge.step);
    key = edge.key;
  }
  return steps.reverse();
}

class MinPriorityQueue<T> {
  private readonly values: T[] = [];

  constructor(private readonly compare: (first: T, second: T) => number) {}

  get size() {
    return this.values.length;
  }

  push(value: T) {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.values[parent], value) <= 0) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): T | undefined {
    const first = this.values[0];
    const tail = this.values.pop();
    if (this.values.length && tail !== undefined) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= this.values.length) break;
        const right = left + 1;
        const child = right < this.values.length && this.compare(this.values[right], this.values[left]) < 0
          ? right
          : left;
        if (this.compare(tail, this.values[child]) <= 0) break;
        this.values[index] = this.values[child];
        index = child;
      }
      this.values[index] = tail;
    }
    return first;
  }
}

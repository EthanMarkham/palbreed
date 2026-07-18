import { breedingRepository } from "../../data/breedingRepository";
import type { OwnedPal } from "../../domain/inventory";
import type { PalGender, PalId } from "../../domain/pal";
import type { PassiveId } from "../../domain/passive";
import { estimatePassiveOdds } from "./passiveProbability";

export type BuilderObjective = "recommended" | "fewest" | "cleanest";

export type BuilderStep = {
  from: PalId;
  partner: PalId;
  partnerOwnedPalId: string;
  result: PalId;
  passiveIds: readonly PassiveId[];
  odds: number;
  expectedCakes: number;
};

export type BuilderResult =
  | {
      status: "found";
      sourceOwnedPalId: string;
      steps: readonly BuilderStep[];
      expectedCakes: number;
      confidence: "exact-carrier-search";
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
  extraCount: number;
  sourceOwnedPalId: string;
  steps: number;
  expectedCakes: number;
};

type Previous = { key: string; step: BuilderStep };

export function buildPal(input: {
  inventory: readonly OwnedPal[];
  targetId: PalId;
  requiredPassiveIds: readonly PassiveId[];
  allowedExtras: 0 | 1 | 2;
  objective: BuilderObjective;
}): BuilderResult {
  const inventory = input.inventory.filter(({ included }) => included);
  const required = [...new Set(input.requiredPassiveIds)].slice(0, 4);
  const available = new Set(inventory.flatMap(({ passiveIds }) => passiveIds));
  const missing = required.filter((id) => !available.has(id));
  if (missing.length) {
    return {
      status: "missing-passives",
      missingPassiveIds: missing,
      reason: "The inventory does not contain every requested passive yet. Add one carrier for each missing passive, then re-run the build.",
    };
  }
  if (!inventory.length) return { status: "no-route", reason: "Add or import Pals before building." };

  const fullMask = (1 << required.length) - 1;
  const queue = new MinPriorityQueue<State>((first, second) => compareState(first, second, input.objective));
  const best = new Map<string, State>();
  const previous = new Map<string, Previous>();

  for (const pal of inventory) {
    const carriedPassiveIds = [...new Set(pal.passiveIds)];
    const state = createState(
      pal.speciesId,
      pal.gender,
      maskFor(carriedPassiveIds, required),
      carriedPassiveIds,
      pal.id,
      0,
      0,
      required,
    );
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
      && current.extraCount <= input.allowedExtras
    ) {
      const steps = reconstruct(current.key, previous);
      return {
        status: "found",
        sourceOwnedPalId: current.sourceOwnedPalId,
        steps,
        expectedCakes: current.expectedCakes,
        confidence: "exact-carrier-search",
      };
    }

    for (const partner of inventory) {
      if (current.steps === 0 && partner.id === current.sourceOwnedPalId) continue;
      const nextMask = current.mask | maskFor(partner.passiveIds, required);
      for (const outcome of breedingRepository.getOutcomes(current.speciesId, partner.speciesId)) {
        const genders = breedingRepository.getGenderRequirement(current.speciesId, partner.speciesId, outcome.childId);
        if (genders && current.gender && genders.firstGender !== current.gender) continue;
        if (genders && genders.secondGender !== partner.gender) continue;

        const desiredIds = passiveIdsFor(nextMask, required);
        const parentUnion = new Set([
          ...current.carriedPassiveIds,
          ...partner.passiveIds,
        ]);
        const isFinalHatch = outcome.childId === input.targetId && nextMask === fullMask;
        const acceptedExtras = isFinalHatch ? input.allowedExtras : 0;
        const odds = estimatePassiveOdds(parentUnion.size, desiredIds.length, acceptedExtras);
        if (desiredIds.length && odds === 0) continue;
        const edgeCakes = odds > 0 ? 1 / odds : 1;
        const next = createState(
          outcome.childId,
          undefined,
          nextMask,
          desiredIds,
          current.sourceOwnedPalId,
          current.steps + 1,
          current.expectedCakes + edgeCakes,
          required,
        );
        const existing = best.get(next.key);
        if (existing && compareState(next, existing, input.objective) >= 0) continue;
        best.set(next.key, next);
        previous.set(next.key, {
          key: current.key,
          step: {
            from: current.speciesId,
            partner: partner.speciesId,
            partnerOwnedPalId: partner.id,
            result: outcome.childId,
            passiveIds: desiredIds,
            odds,
            expectedCakes: edgeCakes,
          },
        });
        queue.push(next);
      }
    }
  }

  return {
    status: "no-route",
    reason: "No continuous carrier build can reach that species and passive set with the included Pals and gender constraints.",
  };
}

function createState(
  speciesId: PalId,
  gender: PalGender | undefined,
  mask: number,
  carriedPassiveIds: readonly PassiveId[],
  sourceOwnedPalId: string,
  steps: number,
  expectedCakes: number,
  required: readonly PassiveId[],
): State {
  const normalizedPassives = [...new Set(carriedPassiveIds)].sort();
  const requiredSet = new Set(required);
  const extraCount = normalizedPassives.filter((id) => !requiredSet.has(id)).length;
  return {
    key: `${speciesId}|${gender ?? "*"}|${mask}|${normalizedPassives.join(",")}`,
    speciesId,
    gender,
    mask,
    carriedPassiveIds: normalizedPassives,
    extraCount,
    sourceOwnedPalId,
    steps,
    expectedCakes,
  };
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

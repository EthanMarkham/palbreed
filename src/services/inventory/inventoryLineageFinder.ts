import { breedingRepository } from "../../data/breedingRepository";
import type { OwnedPal } from "../../domain/inventory";
import type { PalGender, PalId } from "../../domain/pal";

export type InventoryLineageStep = {
  from: PalId;
  partner: PalId;
  partnerOwnedPalId: string;
  result: PalId;
  fromGender?: PalGender;
  partnerGender?: PalGender;
};

export type InventoryLineageResult =
  | { status: "found"; sourceOwnedPalId: string; steps: readonly InventoryLineageStep[] }
  | { status: "already-owned"; sourceOwnedPalId: string }
  | { status: "no-route"; reason: string }
  | { status: "invalid-input"; reason: string };

type SearchNode = {
  key: string;
  speciesId: PalId;
  gender?: PalGender;
  rootOwnedPalId: string;
  depth: number;
};

type Previous = {
  previousKey: string;
  step: InventoryLineageStep;
};

export function findInventoryLineage(input: {
  inventory: readonly OwnedPal[];
  targetId: PalId;
  startOwnedPalId?: string;
}): InventoryLineageResult {
  if (!breedingRepository.getPal(input.targetId)) {
    return { status: "invalid-input", reason: "Choose a valid target Pal." };
  }
  const inventory = input.inventory.filter(({ included }) => included);
  if (!inventory.length) {
    return { status: "no-route", reason: "Add or import at least one Pal before planning." };
  }

  const roots = input.startOwnedPalId
    ? inventory.filter(({ id }) => id === input.startOwnedPalId)
    : inventory;
  if (!roots.length) {
    return { status: "invalid-input", reason: "The selected starting Pal is not in the active inventory." };
  }

  const alreadyOwned = roots.find(({ speciesId }) => speciesId === input.targetId);
  if (alreadyOwned) return { status: "already-owned", sourceOwnedPalId: alreadyOwned.id };

  const queue: SearchNode[] = [];
  const visited = new Set<string>();
  const previous = new Map<string, Previous>();
  for (const root of roots) {
    const node = makeNode(root.speciesId, root.gender, root.id, 0);
    if (visited.has(node.key)) continue;
    visited.add(node.key);
    queue.push(node);
  }

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const partner of inventory) {
      if (current.depth === 0 && partner.id === current.rootOwnedPalId) continue;
      for (const outcome of breedingRepository.getOutcomes(current.speciesId, partner.speciesId)) {
        const genders = breedingRepository.getGenderRequirement(
          current.speciesId,
          partner.speciesId,
          outcome.childId,
        );
        if (genders && current.gender && genders.firstGender !== current.gender) continue;
        if (genders && genders.secondGender !== partner.gender) continue;

        const child = makeNode(outcome.childId, undefined, current.rootOwnedPalId, current.depth + 1);
        if (visited.has(child.key)) continue;
        visited.add(child.key);
        previous.set(child.key, {
          previousKey: current.key,
          step: {
            from: current.speciesId,
            partner: partner.speciesId,
            partnerOwnedPalId: partner.id,
            result: outcome.childId,
            fromGender: genders?.firstGender,
            partnerGender: genders?.secondGender,
          },
        });
        if (outcome.childId === input.targetId) {
          return {
            status: "found",
            sourceOwnedPalId: current.rootOwnedPalId,
            steps: reconstruct(child.key, previous),
          };
        }
        queue.push(child);
      }
    }
  }

  return {
    status: "no-route",
    reason: "No continuous carrier route can reach that target using only the included inventory partners.",
  };
}

function makeNode(speciesId: PalId, gender: PalGender | undefined, rootOwnedPalId: string, depth: number): SearchNode {
  return {
    key: `${speciesId}|${gender ?? "*"}`,
    speciesId,
    gender,
    rootOwnedPalId,
    depth,
  };
}

function reconstruct(targetKey: string, previous: ReadonlyMap<string, Previous>) {
  const steps: InventoryLineageStep[] = [];
  let key = targetKey;
  while (previous.has(key)) {
    const edge = previous.get(key);
    if (!edge) break;
    steps.push(edge.step);
    key = edge.previousKey;
  }
  return steps.reverse();
}

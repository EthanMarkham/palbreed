import type { LineageResult, PalGender, PalId } from "../domain/pal";
import { breedingRepository } from "../data/breedingRepository";

/** Finds the fewest breeding hops, assuming each listed partner is available. */
export function findLineage(startId: PalId, targetId: PalId): LineageResult {
  if (!breedingRepository.getPal(startId) || !breedingRepository.getPal(targetId)) {
    return { status: "invalid-input", reason: "Choose two valid Pals." };
  }
  if (startId === targetId) return { status: "same-pal", steps: [] };

  const queue: PalId[] = [targetId];
  const visited = new Set<PalId>(queue);
  const previous = new Map<PalId, PreviousEdge>();

  for (let head = 0; head < queue.length; head += 1) {
    const child = queue[head];
    for (const [first, second] of breedingRepository.getParentPairs(child)) {
      for (const [parent, partner] of [[first, second], [second, first]] as const) {
        if (visited.has(parent)) continue;
        const genders = breedingRepository.getGenderRequirement(parent, partner, child);
        visited.add(parent);
        previous.set(parent, {
          child,
          partners: [partner],
          fromGender: genders?.firstGender,
          partnerGenders: genders ? [genders.secondGender] : undefined,
        });
        if (parent === startId) return reconstruct(startId, targetId, previous);
        queue.push(parent);
      }
    }
  }
  return { status: "no-route", reason: "No breeding route was found in the loaded data." };
}

type PreviousEdge = {
  child: PalId;
  partners: PalId[];
  fromGender?: PalGender;
  partnerGenders?: PalGender[];
};

function reconstruct(startId: PalId, targetId: PalId, previous: Map<PalId, PreviousEdge>): LineageResult {
  const steps = [];
  let current = startId;
  while (current !== targetId) {
    const edge = previous.get(current);
    if (!edge) return { status: "no-route", reason: "The lineage could not be reconstructed." };
    steps.push({
      from: current,
      partners: edge.partners,
      result: edge.child,
      fromGender: edge.fromGender,
      partnerGenders: edge.partnerGenders,
    });
    current = edge.child;
  }
  return { status: "found", steps };
}

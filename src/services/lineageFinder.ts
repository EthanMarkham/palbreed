import type { LineageResult, PalGender, PalId } from "../domain/pal";
import { breedingRepository } from "../data/breedingRepository";

/** Finds the shortest route, assuming each listed partner is available. */
export function findLineage(startId: PalId, targetId: PalId): LineageResult {
  if (!breedingRepository.getPal(startId) || !breedingRepository.getPal(targetId)) {
    return { status: "invalid-input", reason: "Choose a starting Pal and a target Pal." };
  }
  if (startId === targetId) return { status: "same-pal" };

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
          partner,
          fromGender: genders?.firstGender ?? "F",
          partnerGender: genders?.secondGender ?? "M",
        });
        if (parent === startId) return reconstruct(startId, targetId, previous);
        queue.push(parent);
      }
    }
  }
  return { status: "no-route", reason: "We couldn't find a breeding path between those Pals in the Palworld 1.0 data." };
}

type PreviousEdge = {
  child: PalId;
  partner: PalId;
  fromGender: PalGender;
  partnerGender: PalGender;
};

function reconstruct(startId: PalId, targetId: PalId, previous: Map<PalId, PreviousEdge>): LineageResult {
  const steps = [];
  let current = startId;
  while (current !== targetId) {
    const edge = previous.get(current);
    if (!edge) return { status: "no-route", reason: "Something went wrong while building that path. Try choosing the Pals again." };
    steps.push({
      from: current,
      partner: edge.partner,
      result: edge.child,
      fromGender: edge.fromGender,
      partnerGender: edge.partnerGender,
    });
    current = edge.child;
  }
  return { status: "found", steps };
}

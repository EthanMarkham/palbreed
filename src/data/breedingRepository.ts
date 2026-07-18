import { forEachBreedingOutcome, runtimeMetadata, runtimePals } from "./breedingRuntime";
import {
  pairKey,
  type BreedingOutcome,
  type GenderRequirement,
  type Pal,
  type PalGender,
  type PalId,
  type ParentPair,
} from "../domain/pal";

type GenderedBreedingOutcome = GenderRequirement & { childId: PalId };

const pals: Pal[] = [...runtimePals].sort((a, b) => a.name.localeCompare(b.name));
const palsById = new Map(pals.map((pal) => [pal.id, pal]));
const parentPairsByChild = new Map<PalId, ParentPair[]>();
const genderedOutcomesByParents = new Map<string, GenderedBreedingOutcome[]>();
const outcomesByParents = new Map<string, BreedingOutcome[]>();

forEachBreedingOutcome((outcome) => {
  addForwardOutcome(outcome);
  const pair: ParentPair = outcome.firstParentId.localeCompare(outcome.secondParentId) <= 0
    ? [outcome.firstParentId, outcome.secondParentId]
    : [outcome.secondParentId, outcome.firstParentId];
  const reversePairs = parentPairsByChild.get(outcome.childId) ?? [];
  if (!reversePairs.some(([first, second]) => first === pair[0] && second === pair[1])) {
    reversePairs.push(pair);
    parentPairsByChild.set(outcome.childId, reversePairs);
  }

  if (outcome.firstParentGender && outcome.secondParentGender) {
    addGenderedOutcome(
      outcome.firstParentId,
      outcome.secondParentId,
      outcome.firstParentGender,
      outcome.secondParentGender,
      outcome.childId,
    );
    addGenderedOutcome(
      outcome.secondParentId,
      outcome.firstParentId,
      outcome.secondParentGender,
      outcome.firstParentGender,
      outcome.childId,
    );
  }
});

for (const pairs of parentPairsByChild.values()) {
  pairs.sort((left, right) => pairKey(...left).localeCompare(pairKey(...right)));
}

function addGenderedOutcome(
  first: PalId,
  second: PalId,
  firstGender: PalGender,
  secondGender: PalGender,
  childId: PalId,
) {
  const key = orientedParentKey(first, second);
  const outcomes = genderedOutcomesByParents.get(key) ?? [];
  outcomes.push({ firstGender, secondGender, childId });
  genderedOutcomesByParents.set(key, outcomes);
}

function addForwardOutcome(outcome: BreedingOutcome) {
  const key = pairKey(outcome.firstParentId, outcome.secondParentId);
  const outcomes = outcomesByParents.get(key) ?? [];
  outcomes.push(outcome);
  outcomesByParents.set(key, outcomes);
}

function orientedParentKey(first: PalId, second: PalId) {
  return `${first}|${second}`;
}

export const breedingRepository = {
  allPals: (): readonly Pal[] => pals,
  getPal: (id: PalId): Pal | undefined => palsById.get(id),
  getOutcomes: (first: PalId, second: PalId): readonly BreedingOutcome[] =>
    outcomesByParents.get(pairKey(first, second)) ?? [],
  getParentPairs: (childId: PalId): readonly ParentPair[] => parentPairsByChild.get(childId) ?? [],
  getGenderRequirement: (first: PalId, second: PalId, childId: PalId): GenderRequirement | undefined => {
    const outcome = genderedOutcomesByParents
      .get(orientedParentKey(first, second))
      ?.find((candidate) => candidate.childId === childId);
    return outcome && { firstGender: outcome.firstGender, secondGender: outcome.secondGender };
  },
  metadata: {
    gameVersion: runtimeMetadata.gameVersion,
  },
};

import { forEachBreedingOutcome, runtimeMetadata, runtimePals } from "./breedingRuntime";
import {
  pairKey,
  type GenderedBreedingOutcome,
  type GenderRequirement,
  type Pal,
  type PalGender,
  type PalId,
  type ParentPair,
} from "../domain/pal";

const pals: Pal[] = [...runtimePals].sort((a, b) => a.name.localeCompare(b.name));
const palsById = new Map(pals.map((pal) => [pal.id, pal]));
const parentPairsByChild = new Map<PalId, ParentPair[]>();
const childByParentPair = new Map<string, PalId>();
const genderedOutcomesByParents = new Map<string, GenderedBreedingOutcome[]>();

forEachBreedingOutcome((outcome) => {
  const [firstParentId, secondParentId] = [outcome.firstParentId, outcome.secondParentId].sort();
  const pair: ParentPair = [firstParentId, secondParentId];
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
  } else {
    childByParentPair.set(pairKey(outcome.firstParentId, outcome.secondParentId), outcome.childId);
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

function getGenderedOutcomes(first: PalId, second: PalId): readonly GenderedBreedingOutcome[] {
  return genderedOutcomesByParents.get(orientedParentKey(first, second)) ?? [];
}

function orientedParentKey(first: PalId, second: PalId) {
  return `${first}|${second}`;
}

export const breedingRepository = {
  allPals: (): readonly Pal[] => pals,
  getPal: (id: PalId): Pal | undefined => palsById.get(id),
  getParentPairs: (childId: PalId): readonly ParentPair[] => parentPairsByChild.get(childId) ?? [],
  getChildForGenders: (
    first: PalId,
    second: PalId,
    firstGender: PalGender,
    secondGender: PalGender,
  ): PalId | undefined => {
    if (firstGender === secondGender) return undefined;
    const child = childByParentPair.get(pairKey(first, second));
    if (child) return child;
    return getGenderedOutcomes(first, second).find(
      (outcome) => outcome.firstGender === firstGender && outcome.secondGender === secondGender,
    )?.childId;
  },
  getGenderedOutcomes,
  getGenderRequirement: (first: PalId, second: PalId, childId: PalId): GenderRequirement | undefined => {
    const outcome = getGenderedOutcomes(first, second).find((candidate) => candidate.childId === childId);
    return outcome && { firstGender: outcome.firstGender, secondGender: outcome.secondGender };
  },
  metadata: {
    gameVersion: runtimeMetadata.gameVersion,
    palCount: runtimeMetadata.palCount,
    parentPairCount: runtimeMetadata.parentPairCount,
  },
};

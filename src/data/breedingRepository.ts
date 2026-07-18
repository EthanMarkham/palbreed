import generatedData from "./breeding-1.0.json";
import {
  pairKey,
  type GenderedBreedingOutcome,
  type GenderRequirement,
  type Pal,
  type PalGender,
  type PalId,
  type ParentPair,
} from "../domain/pal";

type GenderedRule = {
  firstParentId: PalId;
  firstParentGender: PalGender;
  secondParentId: PalId;
  secondParentGender: PalGender;
  childId: PalId;
};

const pals = Object.values(generatedData.palsById)
  .map((pal): Pal => ({
    id: pal.id,
    name: pal.name,
    image: pal.image,
    elements: pal.elements,
    breedable: pal.breedable,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const palsById = new Map(pals.map((pal) => [pal.id, pal]));
const parentPairsByChild = new Map<PalId, ParentPair[]>(
  Object.entries(generatedData.parentPairsByChild).map(([childId, pairs]) => [
    childId,
    pairs.map(([first, second]): ParentPair => [first, second]),
  ]),
);
const childByParentPair = new Map<string, PalId>(Object.entries(generatedData.childByParentPair));
const genderedChildrenByParentPair = new Map<string, readonly PalId[]>(
  Object.entries(generatedData.genderedChildrenByParentPair),
);
const genderedRules: readonly GenderedRule[] = generatedData.genderedRules.map((rule) => ({
  ...rule,
  firstParentGender: rule.firstParentGender as PalGender,
  secondParentGender: rule.secondParentGender as PalGender,
}));

function getGenderedOutcomes(first: PalId, second: PalId): readonly GenderedBreedingOutcome[] {
  return genderedRules.flatMap((rule) => {
    if (rule.firstParentId === first && rule.secondParentId === second) {
      return [{
        firstGender: rule.firstParentGender,
        secondGender: rule.secondParentGender,
        childId: rule.childId,
      }];
    }
    if (rule.firstParentId === second && rule.secondParentId === first) {
      return [{
        firstGender: rule.secondParentGender,
        secondGender: rule.firstParentGender,
        childId: rule.childId,
      }];
    }
    return [];
  });
}

export const breedingRepository = {
  allPals: (): readonly Pal[] => pals,
  getPal: (id: PalId): Pal | undefined => palsById.get(id),
  getParentPairs: (childId: PalId): readonly ParentPair[] => parentPairsByChild.get(childId) ?? [],
  getChild: (first: PalId, second: PalId): PalId | undefined => childByParentPair.get(pairKey(first, second)),
  getChildren: (first: PalId, second: PalId): readonly PalId[] => {
    const key = pairKey(first, second);
    const child = childByParentPair.get(key);
    return child ? [child] : (genderedChildrenByParentPair.get(key) ?? []);
  },
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
    gameVersion: generatedData.metadata.gameVersion,
    palCount: generatedData.metadata.palCount,
    parentPairCount: generatedData.metadata.parentPairCount,
    sourceUpdatedAt: generatedData.metadata.sourceUpdatedAt,
  },
};

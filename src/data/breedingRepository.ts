import rawData from "./data.json";
import { pairKey, type Pal, type PalId, type ParentPair } from "../domain/pal";

type RawPal = {
  name: string;
  image?: string;
  elementtype1?: string;
  elementtype2?: string;
};

/**
 * The sole compatibility boundary for generated data. The 1.0 generator will
 * replace this adapter without leaking its JSON shape into UI or algorithms.
 */
const rawPals = rawData.palDex as Record<string, RawPal>;
const nameToId = new Map(Object.keys(rawPals).map((name) => [name, slugify(name)]));

const pals = Object.entries(rawPals)
  .map(([name, raw]): Pal => ({
    id: slugify(name),
    name,
    image: raw.image,
    elements: [raw.elementtype1, raw.elementtype2]
      .filter((element): element is string => Boolean(element && !element.endsWith("::None")))
      .map((element) => element.replace("EPalElementType::", "")),
    breedable: true,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const palsById = new Map(pals.map((pal) => [pal.id, pal]));

const parentPairsByChild = new Map<PalId, ParentPair[]>();
for (const [childName, pairs] of Object.entries(rawData.parentMatches as Record<string, string[][]>)) {
  const childId = nameToId.get(childName);
  if (!childId) continue;
  parentPairsByChild.set(
    childId,
    pairs
      .map(([first, second]) => {
        const firstId = nameToId.get(first);
        const secondId = nameToId.get(second);
        return firstId && secondId ? ([firstId, secondId] as ParentPair) : null;
      })
      .filter((pair): pair is ParentPair => pair !== null),
  );
}

const childByParentPair = new Map<string, PalId>();
for (const [pair, childName] of Object.entries(rawData.breedingLookup as Record<string, string>)) {
  const [first, second] = pair.split("|");
  const firstId = nameToId.get(first);
  const secondId = nameToId.get(second);
  const childId = nameToId.get(childName);
  if (firstId && secondId && childId) childByParentPair.set(pairKey(firstId, secondId), childId);
}

export const breedingRepository = {
  allPals: (): readonly Pal[] => pals,
  getPal: (id: PalId): Pal | undefined => palsById.get(id),
  getParentPairs: (childId: PalId): readonly ParentPair[] => parentPairsByChild.get(childId) ?? [],
  getChild: (first: PalId, second: PalId): PalId | undefined => childByParentPair.get(pairKey(first, second)),
};

function slugify(value: string): PalId {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

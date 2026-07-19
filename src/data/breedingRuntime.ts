import runtimeData from "./breeding-runtime-1.0.json";
import { pairKey, type Pal, type PalGender, type PalId } from "../domain/pal";

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

type RuntimeBreedingOutcome = {
  firstParentId: PalId;
  secondParentId: PalId;
  childId: PalId;
  firstParentGender?: PalGender;
  secondParentGender?: PalGender;
};

export const runtimeMetadata = runtimeData.metadata;
export const runtimePals: readonly Pal[] = runtimeData.pals.map((pal, index) => ({
  ...pal,
  number: index + 1,
  image: `${runtimeMetadata.imageBaseUrl}${pal.id}.webp`,
}));
const runtimePalIndexById = new Map(runtimePals.map((pal, index) => [pal.id, index]));

const genderedRulesByPair = new Map<string, RuntimeBreedingOutcome[]>();
for (const rule of runtimeData.genderedRules) {
  const outcome: RuntimeBreedingOutcome = {
    firstParentId: rule.firstParentId,
    firstParentGender: parseGender(rule.firstParentGender),
    secondParentId: rule.secondParentId,
    secondParentGender: parseGender(rule.secondParentGender),
    childId: rule.childId,
  };
  const key = pairKey(outcome.firstParentId, outcome.secondParentId);
  const rules = genderedRulesByPair.get(key) ?? [];
  rules.push(outcome);
  genderedRulesByPair.set(key, rules);
}

const childIndexByParentsAndSecondGender = new Int16Array(
  runtimePals.length * runtimePals.length * 2,
).fill(-1);

for (let firstIndex = 0; firstIndex < runtimePals.length; firstIndex += 1) {
  const row = runtimeData.matrix[firstIndex];

  for (let secondIndex = firstIndex; secondIndex < runtimePals.length; secondIndex += 1) {
    const offset = (secondIndex - firstIndex) * 2;
    const code = row.slice(offset, offset + 2);
    if (code === "--") continue;

    if (code === "zz") {
      const firstParentId = runtimePals[firstIndex].id;
      const secondParentId = runtimePals[secondIndex].id;
      const rules = genderedRulesByPair.get(pairKey(firstParentId, secondParentId));
      if (!rules?.length) throw new Error(`Missing runtime gender rule for ${firstParentId}|${secondParentId}.`);

      for (const rule of rules) {
        const firstParentGender = rule.firstParentGender;
        const secondParentGender = rule.secondParentGender;
        if (!firstParentGender || !secondParentGender) {
          throw new Error(`Runtime gender rule is incomplete for ${firstParentId}|${secondParentId}.`);
        }
        if (firstParentGender === secondParentGender) {
          throw new Error(`Runtime gender rule must use opposite genders for ${firstParentId}|${secondParentId}.`);
        }
        const orientedFirstIndex = runtimePalIndexById.get(rule.firstParentId);
        const orientedSecondIndex = runtimePalIndexById.get(rule.secondParentId);
        const childIndex = runtimePalIndexById.get(rule.childId);
        if (orientedFirstIndex === undefined || orientedSecondIndex === undefined || childIndex === undefined) {
          throw new Error(`Runtime gender rule references an unknown Pal for ${firstParentId}|${secondParentId}.`);
        }
        setIndexedChild(orientedFirstIndex, orientedSecondIndex, secondParentGender, childIndex);
        setIndexedChild(orientedSecondIndex, orientedFirstIndex, firstParentGender, childIndex);
      }
      continue;
    }

    const childIndex = decodeBase36Pair(code);
    if (!runtimePals[childIndex]) {
      throw new Error(`Runtime breeding matrix references unknown Pal index ${childIndex}.`);
    }
    setIndexedChild(firstIndex, secondIndex, "F", childIndex);
    setIndexedChild(firstIndex, secondIndex, "M", childIndex);
    setIndexedChild(secondIndex, firstIndex, "F", childIndex);
    setIndexedChild(secondIndex, firstIndex, "M", childIndex);
  }
}

/** Compact lookup used by hot solver loops. The first parent is the opposite gender. */
export function getRuntimeChildIndex(
  firstParentIndex: number,
  secondParentIndex: number,
  secondParentGender: PalGender,
) {
  if (
    firstParentIndex < 0
    || firstParentIndex >= runtimePals.length
    || secondParentIndex < 0
    || secondParentIndex >= runtimePals.length
  ) return -1;
  return childIndexByParentsAndSecondGender[indexedChildOffset(
    firstParentIndex,
    secondParentIndex,
    secondParentGender,
  )];
}

export function getRuntimePalIndex(id: PalId) {
  return runtimePalIndexById.get(id);
}

export function forEachBreedingOutcome(visitor: (outcome: RuntimeBreedingOutcome) => void) {
  for (let firstIndex = 0; firstIndex < runtimePals.length; firstIndex += 1) {
    const row = runtimeData.matrix[firstIndex];

    for (let secondIndex = firstIndex; secondIndex < runtimePals.length; secondIndex += 1) {
      const offset = (secondIndex - firstIndex) * 2;
      const code = row.slice(offset, offset + 2);
      if (code === "--") continue;

      const firstParentId = runtimePals[firstIndex].id;
      const secondParentId = runtimePals[secondIndex].id;
      if (code === "zz") {
        const rules = genderedRulesByPair.get(pairKey(firstParentId, secondParentId));
        if (!rules?.length) throw new Error(`Missing runtime gender rule for ${firstParentId}|${secondParentId}.`);
        rules.forEach(visitor);
        continue;
      }

      const childIndex = decodeBase36Pair(code);
      const child = runtimePals[childIndex];
      if (!child) throw new Error(`Runtime breeding matrix references unknown Pal index ${childIndex}.`);
      visitor({ firstParentId, secondParentId, childId: child.id });
    }
  }
}

function parseGender(value: string): PalGender {
  if (value === "F" || value === "M") return value;
  throw new Error(`Invalid runtime gender ${value}.`);
}

function setIndexedChild(
  firstParentIndex: number,
  secondParentIndex: number,
  secondParentGender: PalGender,
  childIndex: number,
) {
  childIndexByParentsAndSecondGender[indexedChildOffset(
    firstParentIndex,
    secondParentIndex,
    secondParentGender,
  )] = childIndex;
}

function indexedChildOffset(
  firstParentIndex: number,
  secondParentIndex: number,
  secondParentGender: PalGender,
) {
  return ((firstParentIndex * runtimePals.length + secondParentIndex) * 2)
    + (secondParentGender === "M" ? 1 : 0);
}

function decodeBase36Pair(code: string) {
  const high = BASE36.indexOf(code[0]);
  const low = BASE36.indexOf(code[1]);
  if (high < 0 || low < 0) throw new Error(`Invalid runtime matrix code ${code}.`);
  return high * 36 + low;
}

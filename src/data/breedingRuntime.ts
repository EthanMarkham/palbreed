import runtimeData from "./breeding-runtime-1.0.json";
import { pairKey, type PalGender, type PalId } from "../domain/pal";

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

type RuntimePalRecord = {
  id: PalId;
  name: string;
};

type RuntimePal = RuntimePalRecord & {
  image: string;
};

type RuntimeBreedingOutcome = {
  firstParentId: PalId;
  secondParentId: PalId;
  childId: PalId;
  firstParentGender?: PalGender;
  secondParentGender?: PalGender;
};

export const runtimeMetadata = runtimeData.metadata;
export const runtimePals: readonly RuntimePal[] = runtimeData.pals.map((pal) => ({
  ...pal,
  image: `${runtimeMetadata.imageBaseUrl}${pal.id}.webp`,
}));

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

function decodeBase36Pair(code: string) {
  const high = BASE36.indexOf(code[0]);
  const low = BASE36.indexOf(code[1]);
  if (high < 0 || low < 0) throw new Error(`Invalid runtime matrix code ${code}.`);
  return high * 36 + low;
}

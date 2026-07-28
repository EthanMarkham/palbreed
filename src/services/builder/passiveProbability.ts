const MAX_PASSIVES = 4;

// Datamined from PalGameSetting:
//   Combi_PassiveInheritNum    = [4, 3, 2, 1] for inherited counts 1-4
//   Combi_PassiveRandomAddNum  = [4, 3, 2, 1] for random counts 0-3
const inheritedCountProbability = [0, 0.4, 0.3, 0.2, 0.1] as const;
const randomAddedCountProbability = [0.4, 0.3, 0.2, 0.1] as const;

export type PassiveOutcomeRequirement =
  | { kind: "any" }
  | { kind: "specific"; desiredCount: number; allowedExtras: number };

/**
 * Chance that an offspring made with regular Cake satisfies a passive goal.
 *
 * The game rolls an inherited count from 1-4, clamps that count to the number
 * of distinct parent passives, and chooses that many passives uniformly from
 * the deduplicated parent pool. It separately rolls 0-3 random additions, then
 * clamps the final result to four passive slots.
 *
 * Random additions are conservatively treated as extras. This intentionally
 * does not credit a random addition for matching a desired passive.
 */
export function estimatePassiveOdds(
  parentUnionSize: number,
  requirement: PassiveOutcomeRequirement,
) {
  if (requirement.kind === "any") return 1;

  const { desiredCount, allowedExtras } = requirement;
  if (
    !Number.isInteger(parentUnionSize)
    || !Number.isInteger(desiredCount)
    || !Number.isInteger(allowedExtras)
    || parentUnionSize < 0
    || desiredCount < 0
    || allowedExtras < 0
    || parentUnionSize > MAX_PASSIVES * 2
    || desiredCount > parentUnionSize
    || desiredCount > MAX_PASSIVES
  ) return 0;

  let probability = 0;

  for (let inheritedRoll = 1; inheritedRoll <= MAX_PASSIVES; inheritedRoll += 1) {
    const inheritedCount = Math.min(inheritedRoll, parentUnionSize);
    if (inheritedCount < desiredCount) continue;

    const inheritedExtras = inheritedCount - desiredCount;
    const selectionProbability = choose(parentUnionSize - desiredCount, inheritedExtras)
      / choose(parentUnionSize, inheritedCount);
    if (!Number.isFinite(selectionProbability) || selectionProbability <= 0) continue;

    for (let randomRoll = 0; randomRoll < randomAddedCountProbability.length; randomRoll += 1) {
      const openSlots = MAX_PASSIVES - inheritedCount;
      const randomExtras = Math.min(randomRoll, openSlots);
      if (inheritedExtras + randomExtras > allowedExtras) continue;

      probability += inheritedCountProbability[inheritedRoll]
        * selectionProbability
        * randomAddedCountProbability[randomRoll];
    }
  }

  return probability;
}

function choose(total: number, count: number) {
  if (count < 0 || count > total) return 0;
  if (count === 0 || count === total) return 1;
  let value = 1;
  for (let index = 1; index <= Math.min(count, total - count); index += 1) {
    value = value * (total - index + 1) / index;
  }
  return value;
}

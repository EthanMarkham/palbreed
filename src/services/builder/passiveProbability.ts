const MAX_PASSIVES = 4;
const inheritedCountProbability = [0, 0.4, 0.3, 0.2, 0.1] as const;
const randomAdditionCountProbability = [0.4, 0.3, 0.2, 0.1] as const;

export type PassiveOutcomeRequirement =
  | { kind: "any" }
  | { kind: "specific"; desiredCount: number; allowedExtras: number };

/**
 * Estimated chance that an offspring made with regular Cake satisfies a
 * passive requirement. Cake effects that override passive inheritance are not
 * included in this model.
 *
 * Parent passives are deduplicated before this function is called. Randomly
 * added passives are conservatively treated as extras; the estimate does not
 * credit a random addition for luckily matching a desired passive.
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
    || desiredCount > parentUnionSize
    || desiredCount > MAX_PASSIVES
  ) return 0;

  const otherCount = parentUnionSize - desiredCount;
  let probability = 0;

  for (let inheritedRoll = 1; inheritedRoll <= MAX_PASSIVES; inheritedRoll += 1) {
    const inheritedCount = Math.min(inheritedRoll, parentUnionSize);
    if (inheritedCount < desiredCount) continue;

    const inheritedExtras = inheritedCount - desiredCount;
    const selectionProbability = choose(otherCount, inheritedExtras)
      / choose(parentUnionSize, inheritedCount);
    if (!Number.isFinite(selectionProbability) || selectionProbability === 0) continue;

    for (let randomRoll = 0; randomRoll < randomAdditionCountProbability.length; randomRoll += 1) {
      const randomAdditions = Math.min(randomRoll, MAX_PASSIVES - inheritedCount);
      if (inheritedExtras + randomAdditions > allowedExtras) continue;
      probability += inheritedCountProbability[inheritedRoll]
        * selectionProbability
        * randomAdditionCountProbability[randomRoll];
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

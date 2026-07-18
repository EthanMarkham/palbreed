const inheritedCountProbability = [0, 0.4, 0.3, 0.2, 0.1] as const;
const noRandomPassiveProbability = 0.4;

/**
 * Estimated chance that an offspring inherits every desired passive and no
 * more than `allowedExtras` other parent passives. This deliberately excludes
 * lucky random additions and is presented as an estimate in the UI.
 */
export function estimatePassiveOdds(
  parentUnionSize: number,
  desiredCount: number,
  allowedExtras: number,
) {
  if (desiredCount === 0) return 1;
  if (desiredCount > parentUnionSize || desiredCount > 4) return 0;
  const otherCount = parentUnionSize - desiredCount;
  let probability = 0;
  for (let extras = 0; extras <= Math.min(allowedExtras, otherCount, 4 - desiredCount); extras += 1) {
    const inherited = desiredCount + extras;
    probability += inheritedCountProbability[inherited]
      * choose(otherCount, extras)
      / choose(parentUnionSize, inherited);
  }
  return probability * noRandomPassiveProbability;
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

const MAX_PASSIVES = 4;
const inheritedCountProbability = [0, 0.4, 0.3, 0.2, 0.1] as const;

export type PassiveOutcomeRequirement =
  | { kind: "any" }
  | { kind: "specific"; desiredCount: number; allowedExtras: number };

/**
 * Estimated chance that an offspring made with regular Cake satisfies a
 * passive requirement. Cake effects that override passive inheritance are not
 * included in this model.
 *
 * Parent passives are deduplicated before this function is called. The game
 * first rolls 1-4 inherited parent passives (40% / 30% / 20% / 10%) and then
 * samples that many distinct passives from the parents' combined pool. Rolls
 * asking for more passives than the parents can supply do not backfill from a
 * smaller parent pool, which is why clean exact 1/2/3/4-passive odds are
 * 40% / 24% / 12% / 10% rather than all collapsed upward successes.
 *
 * Randomly added passives are conservatively treated as extras; the estimate
 * does not credit a random addition for luckily matching a desired passive.
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

  if (parentUnionSize === 0) return desiredCount === 0 ? cleanNoParentPassiveOdds(allowedExtras) : 0;

  const otherCount = parentUnionSize - desiredCount;
  let probability = 0;

  for (let inheritedCount = 1; inheritedCount <= MAX_PASSIVES; inheritedCount += 1) {
    if (inheritedCount > parentUnionSize || inheritedCount < desiredCount) continue;

    const inheritedExtras = inheritedCount - desiredCount;
    if (inheritedExtras > allowedExtras) continue;

    const selectionProbability = choose(otherCount, inheritedExtras)
      / choose(parentUnionSize, inheritedCount);
    if (!Number.isFinite(selectionProbability) || selectionProbability === 0) continue;

    probability += inheritedCountProbability[inheritedCount]
      * selectionProbability
      * randomExtrasWithinLimitProbability(inheritedCount, allowedExtras - inheritedExtras);
  }

  return probability;
}

function cleanNoParentPassiveOdds(allowedExtras: number): number {
  if (allowedExtras < 0) return 0;
  if (allowedExtras >= MAX_PASSIVES) return 1;
  return [0.4, 0.7, 0.9, 1][allowedExtras] ?? 0;
}

function randomExtrasWithinLimitProbability(inheritedCount: number, allowedRandomExtras: number): number {
  const openSlots = MAX_PASSIVES - inheritedCount;
  if (allowedRandomExtras >= openSlots) return 1;
  if (allowedRandomExtras < 0) return 0;

  // The exact-clean odds published by current 1.0 references imply that an egg
  // with 1/2/3 inherited parent passives avoids random junk 100% / 80% / 60%
  // of the time respectively; a 4-inherited egg has no free passive slots.
  if (allowedRandomExtras === 0) return [1, 1, 0.8, 0.6, 1][inheritedCount] ?? 0;

  // For broader "junk allowed" searches, distribute the remaining random-junk
  // mass across the possible non-zero extra counts. This keeps exact outcomes
  // anchored to the observed/datamined clean table while still pricing relaxed
  // passive goals monotonically.
  const noRandomExtras = randomExtrasWithinLimitProbability(inheritedCount, 0);
  const randomExtraOutcomes = openSlots;
  return noRandomExtras + (1 - noRandomExtras) * (allowedRandomExtras / randomExtraOutcomes);
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

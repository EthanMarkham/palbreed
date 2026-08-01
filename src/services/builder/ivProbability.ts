export type IvStat = "hp" | "attack" | "defense";

export type IvScores = Readonly<{
  hp: number;
  attack: number;
  defense: number;
}>;

export type IvGoal = Readonly<Partial<IvScores>>;

export type IvGoalDefinition = Readonly<{
  stat: IvStat;
  minimum: number;
  bit: number;
}>;

// Each Potential category rolls independently: 30% from either parent and
// 40% as a fresh value from the inclusive 1-100 range.
export const IV_PARENT_INHERITANCE_CHANCE = 0.3;
export const IV_RANDOM_ROLL_CHANCE = 0.4;

const IV_STATS = Object.freeze(["hp", "attack", "defense"] as const);
const MIN_IV = 1;
const MAX_IV = 100;

export function normalizeIvGoal(goal: IvGoal | undefined): IvGoal {
  if (!goal) return {};
  const normalized: Partial<Record<IvStat, number>> = {};
  for (const stat of IV_STATS) {
    const minimum = normalizeIvMinimum(goal[stat]);
    if (minimum !== undefined) normalized[stat] = minimum;
  }
  return normalized;
}

export function normalizeIvMinimum(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const normalized = Math.round(value);
  if (normalized < MIN_IV) return undefined;
  return Math.min(normalized, MAX_IV);
}

export function getIvGoalDefinitions(goal: IvGoal | undefined): readonly IvGoalDefinition[] {
  const normalized = normalizeIvGoal(goal);
  const definitions: IvGoalDefinition[] = [];
  for (const stat of IV_STATS) {
    const minimum = normalized[stat];
    if (minimum !== undefined) {
      definitions.push({ stat, minimum, bit: 1 << definitions.length });
    }
  }
  return definitions;
}

export function getIvQualificationMask(
  scores: IvScores | undefined,
  definitions: readonly IvGoalDefinition[],
) {
  if (!scores) return 0;
  let mask = 0;
  for (const definition of definitions) {
    if (scores[definition.stat] >= definition.minimum) mask |= definition.bit;
  }
  return mask;
}

export function ivGoalForMask(
  mask: number,
  definitions: readonly IvGoalDefinition[],
): IvGoal | undefined {
  const goal: Partial<Record<IvStat, number>> = {};
  for (const definition of definitions) {
    if ((mask & definition.bit) !== 0) goal[definition.stat] = definition.minimum;
  }
  return Object.keys(goal).length ? goal : undefined;
}

/** Probability that an inclusive uniform 1-100 fresh roll clears a floor. */
export function randomIvQualificationChance(minimum: number) {
  const normalized = normalizeIvMinimum(minimum);
  return normalized === undefined ? 1 : (MAX_IV - normalized + 1) / MAX_IV;
}

/**
 * Probability that an offspring clears every floor represented by the union
 * of the two parent masks. A fresh 1-100 roll can also clear each floor.
 */
export function estimateIvInheritanceOdds(
  firstMask: number,
  secondMask: number,
  definitions: readonly IvGoalDefinition[],
) {
  const desiredMask = firstMask | secondMask;
  let chance = 1;
  for (let index = 0; index < definitions.length; index += 1) {
    const bit = 1 << index;
    if ((desiredMask & bit) === 0) continue;
    const parentChance = IV_PARENT_INHERITANCE_CHANCE
      * Number((firstMask & bit) !== 0)
      + IV_PARENT_INHERITANCE_CHANCE * Number((secondMask & bit) !== 0);
    chance *= parentChance
      + IV_RANDOM_ROLL_CHANCE * randomIvQualificationChance(definitions[index].minimum);
  }
  return chance;
}

/** Dense per-build lookup for the solver's hot loops (at most 8 x 8). */
export function createIvInheritanceOddsTable(
  definitions: readonly IvGoalDefinition[],
) {
  const variants = 1 << definitions.length;
  const odds = new Float64Array(variants * variants);
  for (let firstMask = 0; firstMask < variants; firstMask += 1) {
    for (let secondMask = 0; secondMask < variants; secondMask += 1) {
      odds[firstMask * variants + secondMask] = estimateIvInheritanceOdds(
        firstMask,
        secondMask,
        definitions,
      );
    }
  }
  return odds;
}

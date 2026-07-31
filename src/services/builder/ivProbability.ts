export type IvScores = Readonly<{
  hp: number;
  attack: number;
  defense: number;
}>;

export type OffspringIvOutcome = Readonly<{
  odds: number;
  scores?: IvScores;
}>;

const PARENT_INHERITANCE_CHANCE = 0.3;
const RANDOM_ROLL_CHANCE = 0.4;
const MIN_IV = 0;
const MAX_IV = 100;
const IV_VALUE_COUNT = MAX_IV - MIN_IV + 1;

/**
 * Models Palworld's independent HP, Attack, and Defense inheritance rolls.
 * Each stat copies either parent 30% of the time and is a uniform 0-100 roll
 * for the remaining 40%.
 */
export function estimateOffspringIvOutcome(
  first: IvScores | undefined,
  second: IvScores | undefined,
  minimumIv?: number,
): OffspringIvOutcome {
  if (minimumIv === undefined) {
    if (!first || !second) return { odds: 1 };
    return {
      odds: 1,
      scores: {
        hp: expectedUnfilteredIv(first.hp, second.hp),
        attack: expectedUnfilteredIv(first.attack, second.attack),
        defense: expectedUnfilteredIv(first.defense, second.defense),
      },
    };
  }

  const minimum = normalizeMinimumIv(minimumIv);
  if (minimum === undefined) return estimateOffspringIvOutcome(first, second);

  const hp = estimateFilteredStat(first?.hp, second?.hp, minimum);
  const attack = estimateFilteredStat(first?.attack, second?.attack, minimum);
  const defense = estimateFilteredStat(first?.defense, second?.defense, minimum);
  return {
    odds: hp.odds * attack.odds * defense.odds,
    scores: {
      hp: hp.expectedValue,
      attack: attack.expectedValue,
      defense: defense.expectedValue,
    },
  };
}

export function normalizeMinimumIv(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const normalized = Math.round(value);
  return normalized <= MIN_IV ? undefined : Math.min(normalized, MAX_IV);
}

export function meetsMinimumIv(scores: IvScores | undefined, minimumIv: number | undefined) {
  const minimum = normalizeMinimumIv(minimumIv);
  return minimum === undefined || Boolean(
    scores
    && scores.hp >= minimum
    && scores.attack >= minimum
    && scores.defense >= minimum,
  );
}

export function getIvQualificationKey(
  scores: IvScores | undefined,
  minimumIv: number | undefined,
) {
  const minimum = normalizeMinimumIv(minimumIv);
  if (minimum === undefined) return 0;
  if (!scores) return 8;
  return (scores.hp >= minimum ? 1 : 0)
    | (scores.attack >= minimum ? 2 : 0)
    | (scores.defense >= minimum ? 4 : 0);
}

function expectedUnfilteredIv(first: number, second: number) {
  return first * PARENT_INHERITANCE_CHANCE
    + second * PARENT_INHERITANCE_CHANCE
    + randomIvMean() * RANDOM_ROLL_CHANCE;
}

function estimateFilteredStat(
  first: number | undefined,
  second: number | undefined,
  minimum: number,
) {
  const randomSuccess = (MAX_IV - minimum + 1) / IV_VALUE_COUNT;
  const randomSuccessfulMean = (minimum + MAX_IV) / 2;
  const firstSource = qualifyingSource(first, minimum, randomSuccess, randomSuccessfulMean);
  const secondSource = qualifyingSource(second, minimum, randomSuccess, randomSuccessfulMean);
  const odds = PARENT_INHERITANCE_CHANCE * firstSource.odds
    + PARENT_INHERITANCE_CHANCE * secondSource.odds
    + RANDOM_ROLL_CHANCE * randomSuccess;
  const weightedValue = PARENT_INHERITANCE_CHANCE * firstSource.weightedValue
    + PARENT_INHERITANCE_CHANCE * secondSource.weightedValue
    + RANDOM_ROLL_CHANCE * randomSuccess * randomSuccessfulMean;
  return { odds, expectedValue: weightedValue / odds };
}

function qualifyingSource(
  value: number | undefined,
  minimum: number,
  unknownSuccess: number,
  unknownSuccessfulMean: number,
) {
  if (value === undefined) {
    return {
      odds: unknownSuccess,
      weightedValue: unknownSuccess * unknownSuccessfulMean,
    };
  }
  return value >= minimum
    ? { odds: 1, weightedValue: value }
    : { odds: 0, weightedValue: 0 };
}

function randomIvMean() {
  return (MIN_IV + MAX_IV) / 2;
}

import statsData from "./pal-stats-runtime-1.0.json";
import type { OwnedPal, PalAbilityScores } from "../domain/inventory";
import type { PalGender, PalId } from "../domain/pal";

type PalCombatCoefficients = {
  hp: number;
  attack: number;
  defense: number;
};

export type PalCombatStats = {
  hp: number;
  attack: number;
  defense: number;
};

export type PalBaseStats = PalCombatStats;

const statsByPalId = statsData.stats as Record<PalId, PalCombatCoefficients>;
const genderProbabilitiesByPalId = statsData.genderProbabilities as Record<
  PalId,
  Record<PalGender, number>
>;

export function getPalGenderProbability(speciesId: PalId, gender: PalGender) {
  const probability = genderProbabilitiesByPalId[speciesId]?.[gender];
  if (probability === undefined) {
    throw new Error(`Missing ${gender} probability for ${speciesId}.`);
  }
  return probability;
}

export function getPalBaseStats(speciesId: PalId): PalBaseStats | undefined {
  return statsByPalId[speciesId];
}

export function getPalCombatStats(pal: OwnedPal): PalCombatStats | undefined {
  if (pal.level === undefined || !pal.abilityScores) return undefined;
  const coefficients = statsByPalId[pal.speciesId];
  if (!coefficients) return undefined;
  return calculatePalCombatStats(coefficients, pal.level, pal.abilityScores);
}

export function calculatePalCombatStats(
  coefficients: PalCombatCoefficients,
  level: number,
  abilityScores: PalAbilityScores,
): PalCombatStats {
  const normalizedLevel = Math.max(1, Math.floor(level));
  return {
    hp: Math.floor(
      500
      + 5 * normalizedLevel
      + coefficients.hp * 0.5 * normalizedLevel * abilityMultiplier(abilityScores.hp)
    ),
    attack: Math.floor(
      100
      + coefficients.attack * 0.075 * normalizedLevel * abilityMultiplier(abilityScores.ranged)
    ),
    defense: Math.floor(
      50
      + coefficients.defense * 0.075 * normalizedLevel * abilityMultiplier(abilityScores.defense)
    ),
  };
}

function abilityMultiplier(value: number) {
  return 1 + Math.max(0, Math.min(100, value)) * 0.003;
}

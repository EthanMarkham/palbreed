import { describe, expect, it } from "vitest";
import {
  calculatePalCombatStats,
  getPalGenderProbability,
} from "./palStatsRepository";

describe("Pal combat stats", () => {
  it("combines species coefficients, level, and hidden scores", () => {
    expect(calculatePalCombatStats(
      { hp: 120, attack: 130, defense: 100 },
      50,
      { hp: 100, melee: 27, ranged: 88, defense: 61 },
    )).toEqual({
      hp: 4_650,
      attack: 716,
      defense: 493,
    });
  });

  it("clamps out-of-range hidden scores", () => {
    expect(calculatePalCombatStats(
      { hp: 100, attack: 100, defense: 100 },
      1,
      { hp: 120, melee: 0, ranged: -10, defense: 0 },
    )).toEqual({
      hp: 570,
      attack: 107,
      defense: 57,
    });
  });
});

describe("Pal gender probabilities", () => {
  it("preserves ordinary and species-specific distributions from PalCalc", () => {
    expect(getPalGenderProbability("lamball", "F")).toBe(0.5);
    expect(getPalGenderProbability("lamball", "M")).toBe(0.5);
    expect(getPalGenderProbability("kingpaca", "F")).toBeCloseTo(0.1);
    expect(getPalGenderProbability("kingpaca", "M")).toBe(0.9);
  });
});

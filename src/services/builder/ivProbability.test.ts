import { describe, expect, it } from "vitest";
import {
  createIvInheritanceOddsTable,
  estimateIvInheritanceOdds,
  getIvGoalDefinitions,
  getIvQualificationMask,
  normalizeIvGoal,
  randomIvQualificationChance,
} from "./ivProbability";

describe("hidden-stat inheritance probability", () => {
  it("counts the 40% fresh 1-100 roll when it clears a floor", () => {
    expect(randomIvQualificationChance(80)).toBeCloseTo(0.21);
    expect(randomIvQualificationChance(100)).toBeCloseTo(0.01);
    expect(randomIvQualificationChance(1)).toBe(1);
  });

  it("uses independent 30/30/40 rolls and rewards two qualifying parents", () => {
    const definitions = getIvGoalDefinitions({ hp: 80 });
    expect(estimateIvInheritanceOdds(1, 0, definitions)).toBeCloseTo(0.384);
    expect(estimateIvInheritanceOdds(1, 1, definitions)).toBeCloseTo(0.684);
  });

  it("multiplies independent category outcomes", () => {
    const definitions = getIvGoalDefinitions({ hp: 80, attack: 90, defense: 100 });
    const expected = 0.684 * 0.644 * 0.604;
    expect(estimateIvInheritanceOdds(7, 7, definitions)).toBeCloseTo(expected);
    expect(createIvInheritanceOddsTable(definitions)[7 * 8 + 7]).toBeCloseTo(expected);
  });

  it("normalizes independent thresholds and encodes only qualifying scores", () => {
    const goal = normalizeIvGoal({ hp: 79.6, attack: 101, defense: 0 });
    const definitions = getIvGoalDefinitions(goal);

    expect(goal).toEqual({ hp: 80, attack: 100 });
    expect(definitions).toEqual([
      { stat: "hp", minimum: 80, bit: 1 },
      { stat: "attack", minimum: 100, bit: 2 },
    ]);
    expect(getIvQualificationMask({ hp: 80, attack: 99, defense: 100 }, definitions)).toBe(1);
  });
});

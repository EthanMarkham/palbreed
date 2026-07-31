import { describe, expect, it } from "vitest";
import {
  estimateOffspringIvOutcome,
  getIvQualificationKey,
  meetsMinimumIv,
  normalizeMinimumIv,
} from "./ivProbability";

const scores = (value: number) => ({ hp: value, attack: value, defense: value });

describe("offspring IV probability", () => {
  it("preserves the unfiltered 30/30/40 expected-value model", () => {
    expect(estimateOffspringIvOutcome(scores(100), scores(100))).toEqual({
      odds: 1,
      scores: scores(80),
    });
  });

  it("includes inherited and fresh rolls that meet an inclusive minimum", () => {
    const outcome = estimateOffspringIvOutcome(scores(100), scores(100), 90);
    const perStatChance = 0.6 + 0.4 * (11 / 101);

    expect(outcome.odds).toBeCloseTo(perStatChance ** 3);
    expect(outcome.scores?.hp).toBeGreaterThanOrEqual(90);
    expect(outcome.scores?.hp).toBeCloseTo(99.6610169492);
  });

  it("uses a uniform 0-100 prior when an imported parent has no IV data", () => {
    const outcome = estimateOffspringIvOutcome(undefined, undefined, 90);

    expect(outcome.odds).toBeCloseTo((11 / 101) ** 3);
    expect(outcome.scores?.hp).toBeCloseTo(95);
    expect(outcome.scores?.attack).toBeCloseTo(95);
    expect(outcome.scores?.defense).toBeCloseTo(95);
  });

  it("counts a random perfect roll at a 100 minimum", () => {
    const outcome = estimateOffspringIvOutcome(scores(100), scores(100), 100);

    expect(outcome.odds).toBeCloseTo((0.6 + 0.4 / 101) ** 3);
    expect(outcome.scores).toEqual(scores(100));
  });

  it("normalizes the configurable minimum and classifies parent quality", () => {
    expect(normalizeMinimumIv(0)).toBeUndefined();
    expect(normalizeMinimumIv(89.6)).toBe(90);
    expect(normalizeMinimumIv(120)).toBe(100);
    expect(meetsMinimumIv({ hp: 90, attack: 91, defense: 92 }, 90)).toBe(true);
    expect(meetsMinimumIv({ hp: 90, attack: 89, defense: 92 }, 90)).toBe(false);
    expect(getIvQualificationKey({ hp: 90, attack: 89, defense: 92 }, 90)).toBe(5);
    expect(getIvQualificationKey(undefined, 90)).toBe(8);
  });
});

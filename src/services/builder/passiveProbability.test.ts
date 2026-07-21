import { describe, expect, it } from "vitest";
import { estimatePassiveOdds } from "./passiveProbability";

describe("passive probability estimate", () => {
  it.each([
    [1, 0.4],
    [2, 0.24],
    [3, 0.12],
    [4, 0.1],
  ])("calculates an exact %i-passive outcome", (desiredCount, expected) => {
    expect(estimatePassiveOdds(
      desiredCount,
      { kind: "specific", desiredCount, allowedExtras: 0 },
    )).toBeCloseTo(expected);
  });

  it("increases when one parent extra is allowed", () => {
    expect(estimatePassiveOdds(4, { kind: "specific", desiredCount: 2, allowedExtras: 0 })).toBeCloseTo(0.04);
    expect(estimatePassiveOdds(4, { kind: "specific", desiredCount: 2, allowedExtras: 1 })).toBeCloseTo(0.105);
  });

  it("distinguishes an exact zero-passive hatch from a wildcard outcome", () => {
    const exactNoPassives = { kind: "specific", desiredCount: 0, allowedExtras: 0 } as const;

    expect(estimatePassiveOdds(0, exactNoPassives)).toBeCloseTo(0.4);
    expect(estimatePassiveOdds(1, exactNoPassives)).toBe(0);
    expect(estimatePassiveOdds(4, { kind: "any" })).toBe(1);
  });

  it("estimates an exact one-passive hatch from clean and passive-bearing parents", () => {
    const cleanParentsAtMostZero = estimatePassiveOdds(
      0,
      { kind: "specific", desiredCount: 0, allowedExtras: 0 },
    );
    const cleanParentsAtMostOne = estimatePassiveOdds(
      0,
      { kind: "specific", desiredCount: 0, allowedExtras: 1 },
    );
    const dirtyParentsAtMostZero = estimatePassiveOdds(
      3,
      { kind: "specific", desiredCount: 0, allowedExtras: 0 },
    );
    const dirtyParentsAtMostOne = estimatePassiveOdds(
      3,
      { kind: "specific", desiredCount: 0, allowedExtras: 1 },
    );

    expect(cleanParentsAtMostOne - cleanParentsAtMostZero).toBeCloseTo(0.3);
    expect(dirtyParentsAtMostOne - dirtyParentsAtMostZero).toBeCloseTo(0.4);
  });

  it("prices one, two, three, or four total passives from four unique parent passives", () => {
    const atMost = (allowedExtras: number) => estimatePassiveOdds(
      4,
      { kind: "specific", desiredCount: 0, allowedExtras },
    );

    expect(atMost(1)).toBeCloseTo(0.4);
    expect(atMost(2) - atMost(1)).toBeCloseTo(0.24);
    expect(atMost(2)).toBeCloseTo(0.64);
    expect(atMost(3)).toBeCloseTo(0.79);
    expect(atMost(4)).toBeCloseTo(1);
  });
});

import { describe, expect, it } from "vitest";
import { estimatePassiveOdds } from "./passiveProbability";

const directProbability = [0, 0.4, 0.3, 0.2, 0.1] as const;
const randomExactProbability = [0.4, 0.3, 0.2, 0.1, 0] as const;
const randomAtLeastProbability = [1, 0.6, 0.3, 0.1, 0] as const;

describe("passive probability estimate", () => {
  it.each([
    [1, 0.4],
    [2, 0.24],
    [3, 0.12],
    [4, 0.1],
  ])("calculates an exact clean %i-passive outcome", (desiredCount, expected) => {
    expect(estimatePassiveOdds(
      desiredCount,
      { kind: "specific", desiredCount, allowedExtras: 0 },
    )).toBeCloseTo(expected);
  });

  it.each([
    {
      parentUnionSize: 2,
      desiredCount: 1,
      allowedExtras: 0,
      expected: 0.08,
    },
    {
      parentUnionSize: 4,
      desiredCount: 2,
      allowedExtras: 0,
      expected: 0.02,
    },
    {
      parentUnionSize: 4,
      desiredCount: 2,
      allowedExtras: 1,
      expected: 0.075,
    },
    {
      parentUnionSize: 4,
      desiredCount: 0,
      allowedExtras: 1,
      expected: 0.16,
    },
  ])(
    "prices desired and unwanted parent passives: $parentUnionSize/$desiredCount/$allowedExtras",
    ({ parentUnionSize, desiredCount, allowedExtras, expected }) => {
      expect(estimatePassiveOdds(
        parentUnionSize,
        { kind: "specific", desiredCount, allowedExtras },
      )).toBeCloseTo(expected);
    },
  );

  it("collapses inherited-count rolls to the available parent pool", () => {
    expect(estimatePassiveOdds(
      1,
      { kind: "specific", desiredCount: 1, allowedExtras: 3 },
    )).toBeCloseTo(1);
    expect(estimatePassiveOdds(
      2,
      { kind: "specific", desiredCount: 2, allowedExtras: 2 },
    )).toBeCloseTo(0.6);
  });

  it("matches the independently formulated PalCalc table for every valid state", () => {
    for (let parentUnionSize = 0; parentUnionSize <= 8; parentUnionSize += 1) {
      for (
        let desiredCount = 0;
        desiredCount <= Math.min(4, parentUnionSize);
        desiredCount += 1
      ) {
        for (let allowedExtras = 0; allowedExtras <= 4 - desiredCount; allowedExtras += 1) {
          expect(estimatePassiveOdds(
            parentUnionSize,
            { kind: "specific", desiredCount, allowedExtras },
          )).toBeCloseTo(referenceCumulativeProbability(
            parentUnionSize,
            desiredCount,
            allowedExtras,
          ));
        }
      }
    }
  });

  it("distinguishes a no-passive goal from accepting any passives", () => {
    expect(estimatePassiveOdds(
      0,
      { kind: "specific", desiredCount: 0, allowedExtras: 0 },
    )).toBeCloseTo(0.4);
    expect(estimatePassiveOdds(
      1,
      { kind: "specific", desiredCount: 0, allowedExtras: 0 },
    )).toBe(0);
    expect(estimatePassiveOdds(4, { kind: "any" })).toBe(1);
  });
});

function referenceCumulativeProbability(
  parentUnionSize: number,
  desiredCount: number,
  allowedExtras: number,
) {
  let probability = 0;
  const maxFinalPassives = Math.min(4, desiredCount + allowedExtras);
  for (
    let finalPassiveCount = desiredCount;
    finalPassiveCount <= maxFinalPassives;
    finalPassiveCount += 1
  ) {
    probability += referenceExactProbability(
      parentUnionSize,
      desiredCount,
      finalPassiveCount,
    );
  }
  return probability;
}

function referenceExactProbability(
  parentUnionSize: number,
  desiredCount: number,
  finalPassiveCount: number,
) {
  let probability = 0;

  for (let inheritedRoll = desiredCount; inheritedRoll <= 4; inheritedRoll += 1) {
    const inheritedCount = Math.min(inheritedRoll, parentUnionSize);
    const inheritedExtras = inheritedCount - desiredCount;
    const randomNeeded = Math.max(0, finalPassiveCount - inheritedCount);
    if (inheritedExtras < 0 || inheritedCount + randomNeeded > finalPassiveCount) continue;

    const inheritedProbability = directProbability[inheritedRoll]
      * choose(parentUnionSize - desiredCount, inheritedExtras)
      / choose(parentUnionSize, inheritedCount);
    const randomProbability = finalPassiveCount === 4
      ? randomAtLeastProbability[randomNeeded]
      : randomExactProbability[randomNeeded];
    probability += inheritedProbability * randomProbability;
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

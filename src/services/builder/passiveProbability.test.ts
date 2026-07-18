import { describe, expect, it } from "vitest";
import { estimatePassiveOdds } from "./passiveProbability";

describe("passive probability estimate", () => {
  it("calculates the exact four-passive outcome", () => {
    expect(estimatePassiveOdds(4, 4, 0)).toBeCloseTo(0.04);
  });

  it("increases when one parent extra is allowed", () => {
    expect(estimatePassiveOdds(4, 2, 0)).toBeCloseTo(0.02);
    expect(estimatePassiveOdds(4, 2, 1)).toBeCloseTo(0.06);
  });
});

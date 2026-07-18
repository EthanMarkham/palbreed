import { describe, expect, it } from "vitest";
import { breedingRepository } from "./breedingRepository";

describe("breedingRepository forward lookup", () => {
  it("returns the Palworld 1.0 child for an unordered parent pair", () => {
    expect(breedingRepository.getOutcomes("lamball", "cattiva").map(({ childId }) => childId))
      .toContain("daedream");
    expect(breedingRepository.getOutcomes("cattiva", "lamball").map(({ childId }) => childId))
      .toContain("daedream");
  });

  it("preserves both gender-specific outcomes in either parent orientation", () => {
    expect(breedingRepository.getOutcomes("katress", "wixen").map(({ childId }) => childId).sort())
      .toEqual(["katress-ignis", "wixen-noct"]);
    expect(breedingRepository.getGenderRequirement("katress", "wixen", "katress-ignis"))
      .toEqual({ firstGender: "F", secondGender: "M" });
    expect(breedingRepository.getGenderRequirement("wixen", "katress", "katress-ignis"))
      .toEqual({ firstGender: "M", secondGender: "F" });
  });
});

import { describe, expect, it } from "vitest";
import { breedingRepository } from "./breedingRepository";
import {
  getRuntimeChildIndex,
  getRuntimePalIndex,
  runtimePals,
} from "./breedingRuntime";

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

describe("compact breeding runtime lookup", () => {
  it("resolves ordinary and gender-specific children by numeric index", () => {
    const lamball = getRuntimePalIndex("lamball");
    const cattiva = getRuntimePalIndex("cattiva");
    const katress = getRuntimePalIndex("katress");
    const wixen = getRuntimePalIndex("wixen");
    expect(lamball).toBeTypeOf("number");
    expect(cattiva).toBeTypeOf("number");
    expect(katress).toBeTypeOf("number");
    expect(wixen).toBeTypeOf("number");
    if (lamball === undefined || cattiva === undefined || katress === undefined || wixen === undefined) return;

    expect(runtimePals[getRuntimeChildIndex(lamball, cattiva, "M")].id).toBe("daedream");
    expect(runtimePals[getRuntimeChildIndex(cattiva, lamball, "F")].id).toBe("daedream");
    expect(runtimePals[getRuntimeChildIndex(katress, wixen, "M")].id).toBe("katress-ignis");
    expect(runtimePals[getRuntimeChildIndex(katress, wixen, "F")].id).toBe("wixen-noct");
    expect(runtimePals[getRuntimeChildIndex(wixen, katress, "F")].id).toBe("katress-ignis");
  });
});

import { describe, expect, it } from "vitest";
import {
  classifyPalLocation,
  resolvePalboxSlotIndex,
  resolveSpeciesId,
} from "./palSaveParser";

describe("resolveSpeciesId", () => {
  it("preserves the special Gumoss breeding species", () => {
    expect(resolveSpeciesId("PlantSlime")).toBe("gumoss");
    expect(resolveSpeciesId("PlantSlime_Flower")).toBe("gumoss-special");
  });

  it("matches Palworld internal IDs without relying on exact casing", () => {
    expect(resolveSpeciesId("SheepBall")).toBe("lamball");
    expect(resolveSpeciesId("sheepball")).toBe("lamball");
    expect(resolveSpeciesId("BOSS_SheepBall")).toBe("lamball");
  });
});

describe("Pal save placement", () => {
  it("only calls a Level-save Pal a Palbox Pal when its container confirms that", () => {
    expect(classifyPalLocation("Level/01.sav", "palbox")).toBe("palbox");
    expect(classifyPalLocation("Level/01.sav")).toBe("base");
  });

  it("keeps an embedded Palbox slot when the authoritative table has no entry", () => {
    expect(resolvePalboxSlotIndex("palbox", undefined, 65)).toBe(65);
  });

  it("prefers the authoritative container slot after a Pal moves", () => {
    expect(resolvePalboxSlotIndex("palbox", 94, 65)).toBe(94);
  });

  it("does not expose container slots as Palbox pages for other locations", () => {
    expect(resolvePalboxSlotIndex("base", 12, 11)).toBeUndefined();
    expect(resolvePalboxSlotIndex("party", 2, 1)).toBeUndefined();
  });
});

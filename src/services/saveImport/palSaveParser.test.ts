import { describe, expect, it } from "vitest";
import {
  classifyPalLocation,
  resolvePalboxSlotIndex,
  resolveSpeciesId,
  selectPreferredImportedPal,
} from "./palSaveParser";
import type { OwnedPal } from "../../domain/inventory";

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
  const basePal: OwnedPal = {
    id: "pal-1",
    sourceInstanceId: "instance-1",
    speciesId: "lamball",
    gender: "F",
    passiveIds: [],
    location: "base",
  };
  const palboxPal: OwnedPal = {
    ...basePal,
    location: "palbox",
    palboxSlotIndex: 65,
  };

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

  it("keeps a confirmed Palbox placement over an unconfirmed Level fallback", () => {
    expect(selectPreferredImportedPal(basePal, palboxPal)).toBe(palboxPal);
    expect(selectPreferredImportedPal(palboxPal, basePal)).toBe(palboxPal);
  });

  it("does not replace an exact Palbox slot with an incomplete duplicate", () => {
    expect(selectPreferredImportedPal(
      palboxPal,
      { ...palboxPal, palboxSlotIndex: undefined },
    )).toBe(palboxPal);
  });
});

import { describe, expect, it } from "vitest";
import { resolveSpeciesId } from "./palSaveParser";

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

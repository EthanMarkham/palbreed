import { describe, expect, it } from "vitest";
import { passiveRepository } from "./passiveRepository";

describe("Palworld 1.0 passive data", () => {
  it("contains fixed, random, and post-1.0 acquisition passives", () => {
    expect(passiveRepository.get("Legend")?.name).toBe("Legend");
    expect(passiveRepository.get("CraftSpeed_up2")?.name).toBe("Artisan");
    expect(passiveRepository.get("WorldTree_CraftSpeed")?.name).toBeTruthy();
  });

  it("does not expose in-game rich-text markup in UI copy", () => {
    for (const passive of passiveRepository.all()) {
      expect(passive.name).not.toMatch(/<[^>]+>/);
      expect(passive.description).not.toMatch(/<[^>]+>/);
    }
  });
});

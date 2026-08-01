import { describe, expect, it } from "vitest";
import { passiveRepository } from "../../data/passiveRepository";
import type { OwnedPal } from "../../domain/inventory";
import { filterInventoryPals, getAverageCombatIv } from "./inventoryCollectionFilter";

const passive = passiveRepository.all()[0];
const pals: readonly OwnedPal[] = [
  {
    id: "second",
    sourceInstanceId: "second",
    speciesId: "cattiva",
    gender: "M",
    passiveIds: [],
    location: "base",
    level: 12,
  },
  {
    id: "first",
    sourceInstanceId: "first",
    speciesId: "lamball",
    nickname: "Woolson",
    gender: "F",
    passiveIds: [passive.id],
    location: "global-storage",
    level: 50,
    abilityScores: { hp: 95, melee: 80, ranged: 85, defense: 90 },
  },
];

describe("Inventory collection filtering", () => {
  it("searches across names, passives, levels, combat stats, and IVs", () => {
    for (const query of ["Woolson", "Lamball", passive.name, "level 50", "iv hp 95"]) {
      expect(filterInventoryPals(pals, { query }).map(({ id }) => id)).toEqual(["first"]);
    }
  });

  it("matches every typed term and sorts the unfiltered collection by display name", () => {
    expect(filterInventoryPals(pals, { query: "wool iv" }).map(({ id }) => id)).toEqual(["first"]);
    expect(filterInventoryPals(pals).map(({ id }) => id)).toEqual(["second", "first"]);
  });

  it("uses a dedicated location filter instead of mixing location into search", () => {
    const palboxPal: OwnedPal = {
      ...pals[0],
      id: "palbox-pal",
      sourceInstanceId: "palbox-pal",
      location: "palbox",
      palboxSlotIndex: 65,
    };

    expect(filterInventoryPals([palboxPal], { query: "palbox page 3" })).toEqual([]);
    expect(filterInventoryPals([palboxPal], { location: "palbox" })).toEqual([palboxPal]);
  });

  it("combines gender, hidden IV, and passive filters", () => {
    expect(getAverageCombatIv(pals[1])).toBe(90);
    expect(filterInventoryPals(pals, {
      gender: "F",
      iv: "average-90",
      passives: "with",
    }).map(({ id }) => id)).toEqual(["first"]);
    expect(filterInventoryPals(pals, { passives: "none" }).map(({ id }) => id)).toEqual(["second"]);
  });

  it("sorts by level, hidden IV average, and location", () => {
    expect(filterInventoryPals(pals, { sort: "level-desc" }).map(({ id }) => id)).toEqual(["first", "second"]);
    expect(filterInventoryPals(pals, { sort: "level-asc" }).map(({ id }) => id)).toEqual(["second", "first"]);
    expect(filterInventoryPals(pals, { sort: "iv-desc" }).map(({ id }) => id)).toEqual(["first", "second"]);
    expect(filterInventoryPals(pals, { sort: "location" }).map(({ id }) => id)).toEqual(["second", "first"]);
  });
});

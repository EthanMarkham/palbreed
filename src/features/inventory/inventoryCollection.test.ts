import { describe, expect, it } from "vitest";
import { passiveRepository } from "../../data/passiveRepository";
import type { OwnedPal } from "../../domain/inventory";
import { filterInventoryPals } from "./inventoryCollectionFilter";

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
  },
];

describe("Inventory collection filtering", () => {
  it("searches across names, passives, sex, level, and location", () => {
    for (const query of ["Woolson", "Lamball", passive.name, "female", "level 50", "global storage"]) {
      expect(filterInventoryPals(pals, query).map(({ id }) => id)).toEqual(["first"]);
    }
  });

  it("matches every typed term and sorts the unfiltered collection by display name", () => {
    expect(filterInventoryPals(pals, "female wool").map(({ id }) => id)).toEqual(["first"]);
    expect(filterInventoryPals(pals, undefined).map(({ id }) => id)).toEqual(["second", "first"]);
  });
});

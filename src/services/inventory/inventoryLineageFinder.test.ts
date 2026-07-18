import { describe, expect, it } from "vitest";
import type { OwnedPal } from "../../domain/inventory";
import { findInventoryLineage } from "./inventoryLineageFinder";

const inventory: OwnedPal[] = [
  { id: "lamball-1", speciesId: "lamball", gender: "F", passiveIds: [], location: "manual", source: "manual", included: true },
  { id: "cattiva-1", speciesId: "cattiva", gender: "M", passiveIds: [], location: "manual", source: "manual", included: true },
];

describe("inventory lineage finder", () => {
  it("finds the one-breeding route using only an owned partner", () => {
    const result = findInventoryLineage({
      inventory,
      targetId: "daedream",
      startOwnedPalId: "lamball-1",
    });
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0]).toMatchObject({ partnerOwnedPalId: "cattiva-1", result: "daedream" });
    }
  });

  it("does not use an excluded partner", () => {
    const result = findInventoryLineage({
      inventory: inventory.map((pal) => pal.id === "cattiva-1" ? { ...pal, included: false } : pal),
      targetId: "daedream",
      startOwnedPalId: "lamball-1",
    });
    expect(result.status).toBe("no-route");
  });
});

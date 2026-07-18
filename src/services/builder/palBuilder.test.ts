import { describe, expect, it } from "vitest";
import type { OwnedPal } from "../../domain/inventory";
import { buildPal } from "./palBuilder";

const inventory: OwnedPal[] = [
  { id: "lamball-1", speciesId: "lamball", gender: "F", passiveIds: ["CraftSpeed_up2"], location: "manual", source: "manual", included: true },
  { id: "cattiva-1", speciesId: "cattiva", gender: "M", passiveIds: [], location: "manual", source: "manual", included: true },
];

describe("Pal Builder", () => {
  it("carries an owned passive to the requested child", () => {
    const result = buildPal({
      inventory,
      targetId: "daedream",
      requiredPassiveIds: ["CraftSpeed_up2"],
      allowedExtras: 0,
      objective: "recommended",
    });
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].passiveIds).toEqual(["CraftSpeed_up2"]);
    }
  });

  it("reports the acquisition gap before searching", () => {
    const result = buildPal({
      inventory,
      targetId: "daedream",
      requiredPassiveIds: ["CraftSpeed_up1"],
      allowedExtras: 0,
      objective: "recommended",
    });
    expect(result).toMatchObject({ status: "missing-passives", missingPassiveIds: ["CraftSpeed_up1"] });
  });

  it("does not treat an owned Pal with an unwanted passive as an exact build", () => {
    const targetWithAnExtra: OwnedPal[] = [{
      id: "daedream-1",
      speciesId: "daedream",
      gender: "F",
      passiveIds: ["CraftSpeed_up2", "CraftSpeed_up1"],
      location: "manual",
      source: "manual",
      included: true,
    }];

    const exactResult = buildPal({
      inventory: targetWithAnExtra,
      targetId: "daedream",
      requiredPassiveIds: ["CraftSpeed_up2"],
      allowedExtras: 0,
      objective: "recommended",
    });
    const relaxedResult = buildPal({
      inventory: targetWithAnExtra,
      targetId: "daedream",
      requiredPassiveIds: ["CraftSpeed_up2"],
      allowedExtras: 1,
      objective: "recommended",
    });

    expect(exactResult.status).toBe("no-route");
    expect(relaxedResult).toMatchObject({ status: "found", steps: [] });
  });

  it("prices unwanted parent passives into the estimated hatch count", () => {
    const result = buildPal({
      inventory: [
        { ...inventory[0], passiveIds: ["CraftSpeed_up2", "CraftSpeed_up1"] },
        inventory[1],
      ],
      targetId: "daedream",
      requiredPassiveIds: ["CraftSpeed_up2"],
      allowedExtras: 0,
      objective: "recommended",
    });

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].odds).toBeCloseTo(0.08);
      expect(result.expectedCakes).toBeCloseTo(12.5);
    }
  });
});

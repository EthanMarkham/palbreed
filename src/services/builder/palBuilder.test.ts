import { describe, expect, it } from "vitest";
import type { OwnedPal } from "../../domain/inventory";
import { buildPal } from "./palBuilder";

const inventory: OwnedPal[] = [
  { id: "lamball-1", sourceInstanceId: "lamball-1", speciesId: "lamball", gender: "F", passiveIds: ["CraftSpeed_up2"], level: 24, location: "palbox" },
  { id: "cattiva-1", sourceInstanceId: "cattiva-1", speciesId: "cattiva", gender: "M", passiveIds: [], level: 17, location: "palbox" },
];

describe("Pal Builder", () => {
  it("carries an owned passive to the requested child", () => {
    const result = buildPal({
      inventory,
      targetId: "daedream",
      passiveGoal: { kind: "specific", requiredIds: ["CraftSpeed_up2"], allowedExtras: 0 },
      objective: "recommended",
    });
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].resultPassives).toEqual({ kind: "known", ids: ["CraftSpeed_up2"] });
      expect(result.steps[0]).toMatchObject({
        firstParent: {
          speciesId: "lamball",
          origin: "inventory",
          level: 24,
          gender: "F",
          passives: { kind: "known", ids: ["CraftSpeed_up2"] },
        },
        secondParent: {
          speciesId: "cattiva",
          origin: "inventory",
          level: 17,
          gender: "M",
          passives: { kind: "known", ids: [] },
        },
      });
    }
  });

  it("describes intermediate hatches when they become proposed parents", () => {
    const result = buildPal({
      inventory,
      targetId: "fuack",
      passiveGoal: { kind: "specific", requiredIds: ["CraftSpeed_up2"], allowedExtras: 0 },
      objective: "fewest",
    });

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.steps).toHaveLength(2);
      expect(result.steps[1].firstParent).toMatchObject({
        speciesId: "daedream",
        origin: "planned",
        level: 1,
        gender: "M",
        passives: { kind: "known", ids: ["CraftSpeed_up2"] },
      });
    }
  });

  it("never proposes a same-sex parent pair", () => {
    const result = buildPal({
      inventory: [inventory[0], { ...inventory[1], gender: "F" }],
      targetId: "daedream",
      passiveGoal: { kind: "specific", requiredIds: ["CraftSpeed_up2"], allowedExtras: 0 },
      objective: "fewest",
    });

    expect(result.status).toBe("no-route");
  });

  it("reports the acquisition gap before searching", () => {
    const result = buildPal({
      inventory,
      targetId: "daedream",
      passiveGoal: { kind: "specific", requiredIds: ["CraftSpeed_up1"], allowedExtras: 0 },
      objective: "recommended",
    });
    expect(result).toMatchObject({ status: "missing-passives", missingPassiveIds: ["CraftSpeed_up1"] });
  });

  it("does not treat an owned Pal with an unwanted passive as an exact build", () => {
    const targetWithAnExtra: OwnedPal[] = [{
      id: "daedream-1",
      sourceInstanceId: "daedream-1",
      speciesId: "daedream",
      gender: "F",
      passiveIds: ["CraftSpeed_up2", "CraftSpeed_up1"],
      location: "palbox",
    }];

    const exactResult = buildPal({
      inventory: targetWithAnExtra,
      targetId: "daedream",
      passiveGoal: { kind: "specific", requiredIds: ["CraftSpeed_up2"], allowedExtras: 0 },
      objective: "recommended",
    });
    const relaxedResult = buildPal({
      inventory: targetWithAnExtra,
      targetId: "daedream",
      passiveGoal: { kind: "specific", requiredIds: ["CraftSpeed_up2"], allowedExtras: 1 },
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
      passiveGoal: { kind: "specific", requiredIds: ["CraftSpeed_up2"], allowedExtras: 0 },
      objective: "recommended",
    });

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].odds).toBeCloseTo(0.08);
      expect(result.expectedCakes).toBeCloseTo(12.5);
    }
  });

  it("accepts an owned target with any passive combination for an Any goal", () => {
    const result = buildPal({
      inventory: [{
        id: "daedream-1",
        sourceInstanceId: "daedream-1",
        speciesId: "daedream",
        gender: "F",
        passiveIds: ["CraftSpeed_up2", "CraftSpeed_up1"],
        location: "palbox",
      }],
      targetId: "daedream",
      passiveGoal: { kind: "any" },
      objective: "recommended",
    });

    expect(result).toMatchObject({ status: "found", steps: [] });
  });

  it("includes a no-passive result when building with an Any goal", () => {
    const result = buildPal({
      inventory,
      targetId: "daedream",
      passiveGoal: { kind: "any" },
      objective: "fewest",
    });

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].resultPassives).toEqual({ kind: "any" });
    }
  });
});

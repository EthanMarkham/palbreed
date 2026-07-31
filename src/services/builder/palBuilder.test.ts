import { describe, expect, it } from "vitest";
import { runtimePals } from "../../data/breedingRuntime";
import type { OwnedPal } from "../../domain/inventory";
import { buildPal } from "./palBuilder";

const inventory: OwnedPal[] = [
  { id: "lamball-1", sourceInstanceId: "lamball-1", speciesId: "lamball", gender: "F", passiveIds: ["CraftSpeed_up2"], level: 24, location: "palbox", palboxSlotIndex: 65 },
  { id: "cattiva-1", sourceInstanceId: "cattiva-1", speciesId: "cattiva", gender: "M", passiveIds: [], level: 17, location: "palbox" },
];

function abilityScores(value: number) {
  return { hp: value, melee: value, ranged: value, defense: value };
}

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
          location: "palbox",
          palboxSlotIndex: 65,
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

  it("uses HP, Attack, and Defense as the final tie-break between equivalent owned Pals", () => {
    const result = buildPal({
      inventory: [
        {
          ...inventory[0],
          id: "lamball-low-ivs",
          sourceInstanceId: "lamball-low-ivs",
          abilityScores: abilityScores(0),
        },
        {
          ...inventory[0],
          id: "lamball-high-ivs",
          sourceInstanceId: "lamball-high-ivs",
          abilityScores: abilityScores(100),
        },
        {
          ...inventory[1],
          abilityScores: abilityScores(100),
        },
      ],
      targetId: "daedream",
      passiveGoal: { kind: "any" },
      objective: "recommended",
    });

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.steps).toHaveLength(1);
      const lamball = [
        result.steps[0].firstParent,
        result.steps[0].secondParent,
      ].find(({ speciesId }) => speciesId === "lamball");
      expect(lamball?.ivScores).toEqual({ hp: 100, attack: 100, defense: 100 });
      expect(result.steps[0].resultIvScores).toEqual({ hp: 80, attack: 80, defense: 80 });
    }
  });

  it("requires and prices an inclusive minimum across all three final IVs", () => {
    const result = buildPal({
      inventory: inventory.map((pal) => ({ ...pal, abilityScores: abilityScores(100) })),
      targetId: "daedream",
      passiveGoal: { kind: "any" },
      objective: "recommended",
      minimumIv: 90,
    });
    const perStatChance = 0.6 + 0.4 * (11 / 101);

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].minimumIv).toBe(90);
      expect(result.steps[0].ivOdds).toBeCloseTo(perStatChance ** 3);
      expect(result.steps[0].odds).toBeCloseTo(perStatChance ** 3);
      expect(result.steps[0].expectedCakes).toBeCloseTo(1 / (perStatChance ** 3));
      expect(result.steps[0].resultIvScores?.hp).toBeGreaterThanOrEqual(90);
    }
  });

  it("does not accept an owned target whose IVs miss the configured floor", () => {
    const result = buildPal({
      inventory: [
        ...inventory.map((pal) => ({ ...pal, abilityScores: abilityScores(100) })),
        {
          id: "daedream-low",
          sourceInstanceId: "daedream-low",
          speciesId: "daedream",
          gender: "F",
          passiveIds: [],
          location: "palbox",
          abilityScores: abilityScores(89),
        },
      ],
      targetId: "daedream",
      passiveGoal: { kind: "any" },
      objective: "recommended",
      minimumIv: 90,
    });

    expect(result.status).toBe("found");
    if (result.status === "found") expect(result.steps).toHaveLength(1);
  });

  it("can prioritize stronger expected offspring IVs without adding a breeding generation", () => {
    const baseInput = {
      inventory: [
        {
          id: "cattiva-clean-low",
          sourceInstanceId: "cattiva-clean-low",
          speciesId: "cattiva",
          gender: "F" as const,
          passiveIds: ["CraftSpeed_up2"],
          location: "palbox" as const,
          abilityScores: abilityScores(0),
        },
        {
          id: "lamball-clean-low",
          sourceInstanceId: "lamball-clean-low",
          speciesId: "lamball",
          gender: "M" as const,
          passiveIds: [],
          location: "palbox" as const,
          abilityScores: abilityScores(0),
        },
        {
          id: "celaray-dirty-high",
          sourceInstanceId: "celaray-dirty-high",
          speciesId: "celaray",
          gender: "F" as const,
          passiveIds: ["CraftSpeed_up2"],
          location: "palbox" as const,
          abilityScores: abilityScores(100),
        },
        {
          id: "chikipi-dirty-high",
          sourceInstanceId: "chikipi-dirty-high",
          speciesId: "chikipi",
          gender: "M" as const,
          passiveIds: ["unwanted"],
          location: "palbox" as const,
          abilityScores: abilityScores(100),
        },
      ],
      targetId: "daedream",
      passiveGoal: {
        kind: "specific" as const,
        requiredIds: ["CraftSpeed_up2"],
        allowedExtras: 0,
      },
    };

    const fewest = buildPal({ ...baseInput, objective: "fewest" });
    const ivs = buildPal({ ...baseInput, objective: "ivs" });

    expect(fewest.status).toBe("found");
    expect(ivs.status).toBe("found");
    if (fewest.status === "found" && ivs.status === "found") {
      expect(fewest.steps).toHaveLength(1);
      expect(ivs.steps).toHaveLength(1);
      expect(new Set([
        fewest.steps[0].firstParent.speciesId,
        fewest.steps[0].secondParent.speciesId,
      ])).toEqual(new Set(["cattiva", "lamball"]));
      expect(new Set([
        ivs.steps[0].firstParent.speciesId,
        ivs.steps[0].secondParent.speciesId,
      ])).toEqual(new Set(["celaray", "chikipi"]));
      expect(ivs.steps[0].resultIvScores).toEqual({ hp: 80, attack: 80, defense: 80 });
      expect(ivs.expectedCakes).toBeGreaterThan(fewest.expectedCakes);
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

  it("prices a required intermediate gender using that species' hatch distribution", () => {
    const result = buildPal({
      inventory: [
        {
          id: "amione-1",
          sourceInstanceId: "amione-1",
          speciesId: "amione",
          gender: "F",
          passiveIds: [],
          location: "palbox",
        },
        {
          id: "dazzi-noct-1",
          sourceInstanceId: "dazzi-noct-1",
          speciesId: "dazzi-noct",
          gender: "M",
          passiveIds: [],
          location: "palbox",
        },
        {
          id: "lamball-1",
          sourceInstanceId: "lamball-1",
          speciesId: "lamball",
          gender: "M",
          passiveIds: [],
          location: "palbox",
        },
      ],
      targetId: "herbil",
      passiveGoal: { kind: "any" },
      objective: "fewest",
    });

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0]).toMatchObject({
        result: "kingpaca",
      });
      expect(result.steps[0].odds).toBeCloseTo(0.1);
      expect(result.steps[1].firstParent).toMatchObject({
        speciesId: "kingpaca",
        origin: "planned",
        gender: "F",
      });
      expect(result.expectedCakes).toBeCloseTo(11);
    }
  });

  it("combines independently bred passive branches when that is the cleanest route", () => {
    const branchInventory: OwnedPal[] = [
      {
        id: "lamball-branch",
        sourceInstanceId: "lamball-branch",
        speciesId: "lamball",
        gender: "F",
        passiveIds: ["wanted-0"],
        location: "palbox",
      },
      {
        id: "blazamut-branch",
        sourceInstanceId: "blazamut-branch",
        speciesId: "blazamut",
        gender: "M",
        passiveIds: ["wanted-1"],
        location: "palbox",
      },
      {
        id: "chikipi-branch",
        sourceInstanceId: "chikipi-branch",
        speciesId: "chikipi",
        gender: "F",
        passiveIds: ["wanted-2"],
        location: "palbox",
      },
      {
        id: "selyne-branch",
        sourceInstanceId: "selyne-branch",
        speciesId: "selyne",
        gender: "M",
        passiveIds: ["wanted-3"],
        location: "palbox",
      },
    ];
    const result = buildPal({
      inventory: branchInventory,
      targetId: "tarantriss",
      passiveGoal: {
        kind: "specific",
        requiredIds: branchInventory.flatMap((pal) => pal.passiveIds),
        allowedExtras: 0,
      },
      objective: "cleanest",
    });

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.steps).toHaveLength(3);
      const finalStep = result.steps[result.steps.length - 1];
      expect(finalStep).toMatchObject({
        result: "tarantriss",
        firstParent: { origin: "planned" },
        secondParent: { origin: "planned" },
        resultPassives: {
          kind: "known",
          ids: ["wanted-0", "wanted-1", "wanted-2", "wanted-3"],
        },
      });
      expect(typeof finalStep.firstParentStepId).toBe("string");
      expect(typeof finalStep.secondParentStepId).toBe("string");
      expect(new Set(result.steps.map(({ id }) => id)).size).toBe(result.steps.length);
      expect(result.expectedCakes).toBeCloseTo(26.666666667);
    }
  });

  it.each(["cleanest", "ivs"] as const)("keeps a full Palbox $objective search bounded", (objective) => {
    const requiredIds = [
      "CraftSpeed_up2",
      "CraftSpeed_up3",
      "MutationPal_Babysitter",
      "Vampire",
    ];
    const species = runtimePals.filter(({ id }) => id !== "dynamoff");
    const largeInventory: OwnedPal[] = Array.from({ length: 690 }, (_, index) => ({
      id: `large-${index}`,
      sourceInstanceId: `large-${index}`,
      speciesId: species[index % species.length].id,
      gender: index % 2 === 0 ? "F" : "M",
      passiveIds: index < requiredIds.length ? [requiredIds[index]] : [],
      location: "palbox",
    }));
    const startedAt = performance.now();

    const result = buildPal({
      inventory: largeInventory,
      targetId: "dynamoff",
      passiveGoal: {
        kind: "specific",
        requiredIds,
        allowedExtras: 0,
      },
      objective,
    });

    expect(result.status).toBe("found");
    expect(performance.now() - startedAt).toBeLessThan(3_000);
  }, 5_000);

  it("never proposes a same-sex parent pair", () => {
    const result = buildPal({
      inventory: [inventory[0], { ...inventory[1], gender: "F" }],
      targetId: "daedream",
      passiveGoal: { kind: "specific", requiredIds: ["CraftSpeed_up2"], allowedExtras: 0 },
      objective: "fewest",
    });

    expect(result.status).toBe("no-route");
  });

  it.each([
    { firstGender: "F" as const, secondGender: "M" as const, targetId: "katress-ignis" },
    { firstGender: "M" as const, secondGender: "F" as const, targetId: "wixen-noct" },
  ])(
    "preserves gender-specific children when building $targetId",
    ({ firstGender, secondGender, targetId }) => {
      const result = buildPal({
        inventory: [
          { ...inventory[0], id: "katress-1", speciesId: "katress", gender: firstGender },
          { ...inventory[1], id: "wixen-1", speciesId: "wixen", gender: secondGender },
        ],
        targetId,
        passiveGoal: { kind: "any" },
        objective: "fewest",
      });

      expect(result.status).toBe("found");
      if (result.status === "found") {
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0]).toMatchObject({
          firstParent: { speciesId: "katress", gender: firstGender },
          secondParent: { speciesId: "wixen", gender: secondGender },
          result: targetId,
        });
      }
    },
  );

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
      expect(result.steps[0].odds).toBe(1);
    }
  });

  it("requires clean parents for an exact no-passive hatch", () => {
    const dirtyResult = buildPal({
      inventory,
      targetId: "daedream",
      passiveGoal: { kind: "specific", requiredIds: [], allowedExtras: 0 },
      objective: "fewest",
    });
    const cleanResult = buildPal({
      inventory: inventory.map((pal) => ({ ...pal, passiveIds: [] })),
      targetId: "daedream",
      passiveGoal: { kind: "specific", requiredIds: [], allowedExtras: 0 },
      objective: "fewest",
    });

    expect(dirtyResult.status).toBe("no-route");
    expect(cleanResult.status).toBe("found");
    if (cleanResult.status === "found") {
      expect(cleanResult.steps[0].odds).toBeCloseTo(0.4);
      expect(cleanResult.steps[0].expectedCakes).toBeCloseTo(2.5);
    }
  });

  it("accepts up to one passive when an exact clean hatch is impossible", () => {
    const result = buildPal({
      inventory: inventory.map((pal, index) => ({
        ...pal,
        passiveIds: [`unwanted-${index}`],
      })),
      targetId: "daedream",
      passiveGoal: { kind: "specific", requiredIds: [], allowedExtras: 1 },
      objective: "fewest",
    });

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.steps[0].resultPassives).toEqual({ kind: "bounded", ids: [], maxExtras: 1 });
      expect(result.steps[0].odds).toBeCloseTo(0.16);
      expect(result.steps[0].expectedCakes).toBeCloseTo(6.25);
    }
  });

  it.each([
    {
      allowedFinalExtras: 0 as const,
      expectedBridgeExtras: 2,
      expectedBridgeOdds: 0.2,
      expectedCakes: 23.75,
    },
    {
      allowedFinalExtras: 1 as const,
      expectedBridgeExtras: 3,
      expectedBridgeOdds: 0.325,
      expectedCakes: 10.769230769,
    },
  ])(
    "chooses the globally cheaper bridge when the final build allows $allowedFinalExtras extras",
    ({ allowedFinalExtras, expectedBridgeExtras, expectedBridgeOdds, expectedCakes }) => {
      const result = buildPal({
        inventory: [
          {
            id: "relaxaurus-lux-1",
            sourceInstanceId: "relaxaurus-lux-1",
            speciesId: "relaxaurus-lux",
            gender: "F",
            passiveIds: ["unwanted-a", "unwanted-b"],
            location: "palbox",
          },
          {
            id: "blazamut-1",
            sourceInstanceId: "blazamut-1",
            speciesId: "blazamut",
            gender: "M",
            passiveIds: ["unwanted-c", "unwanted-d"],
            location: "palbox",
          },
          {
            id: "selyne-1",
            sourceInstanceId: "selyne-1",
            speciesId: "selyne",
            gender: "F",
            passiveIds: ["desired-passive"],
            location: "palbox",
          },
        ],
        targetId: "anubis",
        passiveGoal: {
          kind: "specific",
          requiredIds: ["desired-passive"],
          allowedExtras: allowedFinalExtras,
        },
        objective: "cleanest",
      });

      expect(result.status).toBe("found");
      if (result.status === "found") {
        expect(result.steps).toHaveLength(2);
        expect(result.steps[0]).toMatchObject({
          result: "jormuntide",
          resultPassives: { kind: "bounded", ids: [], maxExtras: expectedBridgeExtras },
        });
        expect(result.steps[0].odds).toBeCloseTo(expectedBridgeOdds);
        expect(result.expectedCakes).toBeCloseTo(expectedCakes);
      }
    },
  );
});

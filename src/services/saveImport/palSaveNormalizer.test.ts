import { describe, expect, it } from "vitest";
import { normalizePalsFromParsedSave } from "./palSaveNormalizer";

describe("normalizePalsFromParsedSave", () => {
  it("reads suffixed Palworld 1.0 fields and the ancestor instance id", () => {
    const parsed = {
      root: {
        properties: {
          worldSaveData_0: {
            CharacterSaveParameterMap_0: [
              {
                key: { InstanceId_0: "fa2f9a90-310f-4bd1-beb4-984dc17f8991" },
                value: {
                  RawData_0: {
                    object: {
                      SaveParameter_0: {
                        CharacterID_0: "PinkCat",
                        Gender_0: "EPalGenderType::Female",
                        Level_0: 42,
                        NickName_0: "Mochi",
                        PassiveSkillList_0: ["CraftSpeed_up3", "Vampire"],
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    };

    expect(normalizePalsFromParsedSave(parsed)).toEqual([
      {
        speciesId: "PinkCat",
        gender: "EPalGenderType::Female",
        passiveIds: ["CraftSpeed_up3", "Vampire"],
        instanceId: "fa2f9a90-310f-4bd1-beb4-984dc17f8991",
        nickname: "Mochi",
        level: 42,
      },
    ]);
  });
});

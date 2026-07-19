import { describe, expect, it } from "vitest";
import { normalizePalsFromParsedSave, normalizePlayersFromParsedSave } from "./palSaveNormalizer";

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

  it("reads player identity metadata from the player character parameter", () => {
    const parsed = {
      root: {
        properties: {
          CharacterSaveParameterMap_0: [{
            key: { PlayerUId_0: "12345678-1234-1234-1234-1234567890AB" },
            value: {
              SaveParameter_0: {
                CharacterID_0: "PlayerMale_A",
                NickName_0: "Ethan",
                Level_0: 65,
              },
            },
          }],
        },
      },
    };

    expect(normalizePlayersFromParsedSave(parsed)).toEqual([{
      id: "123456781234123412341234567890ab",
      name: "Ethan",
      level: 65,
    }]);
  });

  it("ignores Pal parameters while reading player metadata", () => {
    const parsed = {
      SaveParameter_0: {
        CharacterID_0: "PinkCat",
        NickName_0: "Mochi",
        Level_0: 42,
      },
    };

    expect(normalizePlayersFromParsedSave(parsed)).toEqual([]);
  });
});

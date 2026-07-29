import { describe, expect, it } from "vitest";
import {
  normalizePalContainerSlotsFromParsedSave,
  normalizePalsFromParsedSave,
  normalizePlayerContainersFromParsedSave,
  normalizePlayersFromParsedSave,
} from "./palSaveNormalizer";

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
                        Talent_HP_0: 100,
                        Talent_Melee_0: 27,
                        Talent_Shot_0: 88,
                        Talent_Defense_0: 61,
                        SlotId_0: {
                          ContainerId_0: { ID_0: "13572468-1234-5678-90ab-1234567890ab" },
                          SlotIndex_0: 65,
                        },
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
        containerId: "13572468-1234-5678-90ab-1234567890ab",
        containerSlotIndex: 65,
        nickname: "Mochi",
        level: 42,
        abilityScores: { hp: 100, melee: 27, ranged: 88, defense: 61 },
      },
    ]);
  });

  it("reads the player's party and Palbox container IDs", () => {
    const parsed = {
      SaveData_0: {
        PalStorageContainerId_0: {
          ID_0: "11111111-2222-3333-4444-555555555555",
        },
        OtomoCharacterContainerId_0: {
          ID_0: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        },
      },
    };

    expect(normalizePlayerContainersFromParsedSave(parsed)).toEqual({
      palboxContainerId: "11111111-2222-3333-4444-555555555555",
      partyContainerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
  });

  it("reads the authoritative Palbox slot by Pal instance id", () => {
    const parsed = {
      CharacterContainerSaveData_0: {
        value: [{
          key: {
            ID_0: "13572468-1234-5678-90ab-1234567890ab",
          },
          value: {
            Slots_0: {
              value: {
                values: [{
                  SlotIndex_0: { value: 65 },
                  RawData_0: {
                    value: {
                      instance_id: "fa2f9a90-310f-4bd1-beb4-984dc17f8991",
                    },
                  },
                }],
              },
            },
          },
        }],
      },
    };

    expect(normalizePalContainerSlotsFromParsedSave(parsed)).toEqual([{
      instanceId: "fa2f9a90-310f-4bd1-beb4-984dc17f8991",
      slotIndex: 65,
      containerId: "13572468-1234-5678-90ab-1234567890ab",
    }]);
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

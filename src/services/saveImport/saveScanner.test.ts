import { describe, expect, it } from "vitest";
import type { SaveSlotCandidate } from "../../domain/saveImport";
import { SaveImportError } from "../../domain/saveImport";
import { assertPalworldOnePointZero, scanSaveSelection } from "./saveScanner";

function slot(format: SaveSlotCandidate["format"]): SaveSlotCandidate {
  return { id: "slot", worldId: "world", label: "Test world", format, files: new Map() };
}

describe("strict Palworld 1.0 format guard", () => {
  it("accepts only the 1.0 layout", () => {
    expect(() => assertPalworldOnePointZero(slot("palworld-1.0"))).not.toThrow();
  });

  it("throws the typed pre-1.0 error", () => {
    expect(() => assertPalworldOnePointZero(slot("pre-1.0"))).toThrowError(
      expect.objectContaining<Partial<SaveImportError>>({ code: "UNSUPPORTED_PRE_1_0" }),
    );
  });

  it("discovers and rejects a legacy Level.sav-only folder", async () => {
    const legacy = fakeSteamFile("SaveGames/account/world/Level.sav");

    await expect(scanSaveSelection([legacy], "steam")).rejects.toMatchObject({
      code: "UNSUPPORTED_PRE_1_0",
    });
  });

  it("rejects an incomplete split layout as an unsupported revision", async () => {
    const splitLevelOnly = fakeSteamFile("SaveGames/account/world/Level/01.sav");

    await expect(scanSaveSelection([splitLevelOnly], "steam")).rejects.toMatchObject({
      code: "UNSUPPORTED_1_0_REVISION",
    });
  });

  it("hides backup roots and labels current worlds without exposing UUIDs", async () => {
    const firstWorld = "11111111111111111111111111111111";
    const secondWorld = "22222222222222222222222222222222";
    const files = [
      fakeSteamFile(`SaveGames/account/${firstWorld}/LevelMeta.sav`, 20),
      fakeSteamFile(`SaveGames/account/${firstWorld}/Level/01.sav`, 20),
      fakeSteamFile(`SaveGames/account/${secondWorld}/LevelMeta.sav`, 30),
      fakeSteamFile(`SaveGames/account/${secondWorld}/Level/01.sav`, 30),
      fakeSteamFile(`SaveGames/account/${firstWorld}/backup/world/20260718/LevelMeta.sav`, 100),
      fakeSteamFile(`SaveGames/account/${firstWorld}/backup/world/20260718/Level/01.sav`, 100),
      fakeSteamFile(`SaveGames/account/${secondWorld}/Slot1/LevelMeta.sav`, 50),
      fakeSteamFile(`SaveGames/account/${secondWorld}/Slot1/Level/01.sav`, 50),
    ];

    const manifest = await scanSaveSelection(files, "steam");

    expect(manifest.slots).toHaveLength(2);
    expect(manifest.slots.map(({ label }) => label)).toEqual(["World 1", "World 2"]);
    expect(manifest.accountId).toBe("account");
    expect(manifest.slots[0]?.worldId).toBe(secondWorld);
    expect(manifest.slots[0]?.updatedAt).toBe(30);
  });
});

function fakeSteamFile(path: string, lastModified = 1): File {
  const parts = path.split("/");
  return {
    name: parts[parts.length - 1] || "save.sav",
    webkitRelativePath: path,
    lastModified,
  } as File;
}

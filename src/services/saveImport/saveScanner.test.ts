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
});

function fakeSteamFile(path: string): File {
  const parts = path.split("/");
  return {
    name: parts[parts.length - 1] || "save.sav",
    webkitRelativePath: path,
    lastModified: 1,
  } as File;
}

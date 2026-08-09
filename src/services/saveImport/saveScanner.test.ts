import { describe, expect, it } from "vitest";
import type { SaveSlotCandidate } from "../../domain/saveImport";
import { SaveImportError } from "../../domain/saveImport";
import {
  assertPalworldOnePointZero,
  parseContainerIndex,
  scanLogicalSaveSelection,
  scanSaveSelection,
} from "./saveScanner";

function slot(format: SaveSlotCandidate["format"]): SaveSlotCandidate {
  return { id: "slot", worldId: "world", label: "Test world", format, rootPath: "world", files: new Map() };
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
    expect(manifest.sourceAccountId).toBe("account");
    expect(manifest.accountId).toMatch(/^palpath-source-v1:[a-f\d]{64}$/);
    expect(manifest.slots[0]?.worldId).toBe(secondWorld);
    expect(manifest.slots[0]?.updatedAt).toBe(30);
  });

  it("preserves the exact selected world root for persistent folder polling", async () => {
    const worldId = "33333333333333333333333333333333";
    const manifest = await scanLogicalSaveSelection([
      logicalSteamFile(`SaveGames/account/${worldId}/LevelMeta.sav`, 20),
      logicalSteamFile(`SaveGames/account/${worldId}/Level/01.sav`, 30),
    ], "steam");

    expect(manifest.slots[0]).toMatchObject({
      worldId,
      rootPath: `SaveGames/account/${worldId}`,
    });
    expect(manifest.slots[0]?.files.get("level/01.sav")?.updatedAt).toBe(30);
  });

  it("refuses to merge Xbox worlds from multiple account indexes", async () => {
    const fakeIndex = (path: string) => ({
      path,
      file: {
        name: "containers.index",
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      } as unknown as File,
    });

    await expect(scanLogicalSaveSelection([
      fakeIndex("wgs/account_one/containers.index"),
      fakeIndex("wgs/account_two/containers.index"),
    ], "xbox")).rejects.toMatchObject({ code: "WRONG_FOLDER" });
  });
});

describe("Xbox WGS format guard", () => {
  it("accepts the supported containers.index version", () => {
    const buffer = new ArrayBuffer(40);
    const view = new DataView(buffer);
    view.setInt32(0, 14, true);
    view.setInt32(4, 0, true);

    expect(parseContainerIndex(buffer)).toEqual([]);
  });

  it("fails closed on an unknown containers.index version", () => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setInt32(0, 99, true);

    expect(() => parseContainerIndex(buffer)).toThrowError(
      expect.objectContaining<Partial<SaveImportError>>({
        code: "UNSUPPORTED_1_0_REVISION",
      }),
    );
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

function logicalSteamFile(path: string, lastModified = 1) {
  const parts = path.split("/");
  return {
    path,
    file: {
      name: parts[parts.length - 1] ?? "save.sav",
      lastModified,
    } as File,
    updatedAt: lastModified,
  };
}

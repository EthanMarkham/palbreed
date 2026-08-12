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

  it("ignores a missing legacy Level container after a world migrated to 1.0", async () => {
    const worldId = "97CDB9084991CA590C8EC482AF63A81B";
    const legacyFolder = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const levelFolder = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    const metaFolder = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
    const levelBlob = "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD";
    const metaBlob = "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE";
    const index = xboxIndexFile([
      { name: `${worldId}-Level`, folderGuid: legacyFolder },
      { name: `${worldId}-Level-01`, folderGuid: levelFolder },
      { name: `${worldId}-LevelMeta`, folderGuid: metaFolder },
    ]);
    const files = [
      logicalXboxFile("wgs/account/containers.index", index, 10),
      logicalXboxFile(`wgs/account/${levelFolder}/container.1`, xboxContainerFile(levelBlob), 20),
      logicalXboxFile(`wgs/account/${levelFolder}/${levelBlob}`, new ArrayBuffer(0), 30),
      logicalXboxFile(`wgs/account/${metaFolder}/container.1`, xboxContainerFile(metaBlob), 20),
      logicalXboxFile(`wgs/account/${metaFolder}/${metaBlob}`, new ArrayBuffer(0), 30),
    ];

    const manifest = await scanLogicalSaveSelection(files, "xbox");

    expect(manifest.slots).toHaveLength(1);
    expect(manifest.slots[0]).toMatchObject({
      worldId,
      format: "palworld-1.0",
    });
    expect(manifest.slots[0]?.files.has("level.sav")).toBe(false);
  });

  it("still rejects a missing current 1.0 container", async () => {
    const worldId = "97CDB9084991CA590C8EC482AF63A81B";
    const levelFolder = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    const metaFolder = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
    const metaBlob = "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE";
    const index = xboxIndexFile([
      { name: `${worldId}-Level-01`, folderGuid: levelFolder },
      { name: `${worldId}-LevelMeta`, folderGuid: metaFolder },
    ]);
    const files = [
      logicalXboxFile("wgs/account/containers.index", index, 10),
      logicalXboxFile(`wgs/account/${metaFolder}/container.1`, xboxContainerFile(metaBlob), 20),
      logicalXboxFile(`wgs/account/${metaFolder}/${metaBlob}`, new ArrayBuffer(0), 30),
    ];

    await expect(scanLogicalSaveSelection(files, "xbox")).rejects.toMatchObject({
      code: "INCOMPLETE_CLOUD_SYNC",
    });
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

type XboxIndexFixture = {
  name: string;
  folderGuid: string;
};

function xboxIndexFile(entries: readonly XboxIndexFixture[]) {
  const writer = new BinaryFixtureWriter();
  writer.int32(14);
  writer.int32(entries.length);
  writer.zeros(4);
  writer.utf16("");
  writer.zeros(8);
  writer.zeros(4);
  writer.utf16("");
  writer.zeros(8);
  entries.forEach((entry, index) => {
    writer.utf16(entry.name);
    writer.utf16(entry.name);
    writer.utf16("");
    writer.uint8(1);
    writer.zeros(4);
    writer.guid(entry.folderGuid);
    writer.uint64(BigInt(index + 1));
    writer.zeros(16);
  });
  return writer.arrayBuffer();
}

function xboxContainerFile(blobGuid: string) {
  const writer = new BinaryFixtureWriter();
  writer.int32(4);
  writer.int32(1);
  writer.fixedUtf16("Data", 64);
  writer.guid(blobGuid);
  writer.guid(blobGuid);
  return writer.arrayBuffer();
}

function logicalXboxFile(path: string, contents: ArrayBuffer, lastModified: number) {
  const parts = path.split("/");
  const name = parts[parts.length - 1] ?? "save";
  return {
    path,
    file: {
      name,
      lastModified,
      size: contents.byteLength,
      arrayBuffer: () => Promise.resolve(contents),
    } as unknown as File,
    updatedAt: lastModified,
  };
}

class BinaryFixtureWriter {
  private readonly bytes: number[] = [];

  int32(value: number) {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setInt32(0, value, true);
    this.append(buffer);
  }

  uint8(value: number) {
    this.bytes.push(value);
  }

  uint64(value: bigint) {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setBigUint64(0, value, true);
    this.append(buffer);
  }

  utf16(value: string) {
    this.int32(value.length);
    this.fixedUtf16(value, value.length);
  }

  fixedUtf16(value: string, length: number) {
    for (let index = 0; index < length; index += 1) {
      const code = value.charCodeAt(index) || 0;
      this.bytes.push(code & 0xff, code >> 8);
    }
  }

  guid(value: string) {
    const bytes = value.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [];
    this.bytes.push(
      bytes[3], bytes[2], bytes[1], bytes[0],
      bytes[5], bytes[4], bytes[7], bytes[6],
      ...bytes.slice(8),
    );
  }

  zeros(length: number) {
    this.bytes.push(...new Array<number>(length).fill(0));
  }

  arrayBuffer() {
    return Uint8Array.from(this.bytes).buffer;
  }

  private append(buffer: ArrayBuffer) {
    this.bytes.push(...new Uint8Array(buffer));
  }
}

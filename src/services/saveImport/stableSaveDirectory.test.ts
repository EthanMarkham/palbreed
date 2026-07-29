import { describe, expect, it } from "vitest";
import { readStableSaveDirectory } from "./stableSaveDirectory";

describe("stable manual save refresh", () => {
  it("retries until the Steam trigger is stable", async () => {
    const worldId = "33333333333333333333333333333333";
    const levelFile = versionedFileHandle("01.sav", [
      [42, 100],
      [43, 101],
      [43, 101],
      [43, 101],
      [43, 101],
      [43, 101],
    ]);
    const root = fakeDirectory("SaveGames", {
      account: fakeDirectory("account", {
        [worldId]: fakeDirectory(worldId, {
          LevelMeta: fakeFileHandle("LevelMeta.sav", 20, 90),
          Level: fakeDirectory("Level", { current: levelFile.handle }),
        }),
      }),
    });

    const files = await readStableSaveDirectory(root, {
      platform: "steam",
      worldRootPath: `SaveGames/account/${worldId}`,
      stabilityDelayMs: 0,
    });

    expect(levelFile.calls()).toBe(6);
    expect(files.map(({ path }) => path).sort()).toEqual([
      `SaveGames/account/${worldId}/Level/01.sav`,
      `SaveGames/account/${worldId}/LevelMeta.sav`,
    ]);
  });

  it("rejects a snapshot that keeps changing", async () => {
    const worldId = "33333333333333333333333333333333";
    const levelFile = versionedFileHandle("01.sav", [
      [42, 100],
      [43, 101],
    ]);
    const root = fakeDirectory("SaveGames", {
      account: fakeDirectory("account", {
        [worldId]: fakeDirectory(worldId, {
          LevelMeta: fakeFileHandle("LevelMeta.sav", 20, 90),
          Level: fakeDirectory("Level", { current: levelFile.handle }),
        }),
      }),
    });

    await expect(readStableSaveDirectory(root, {
      platform: "steam",
      worldRootPath: `SaveGames/account/${worldId}`,
      stabilityDelayMs: 0,
      stabilityAttempts: 1,
    })).rejects.toMatchObject({
      code: "CORRUPT_SAVE",
    });
  });

  it("returns a stable Xbox snapshot for only the imported account", async () => {
    const firstAccount = fakeDirectory("account_one", {
      index: fakeFileHandle("containers.index", 20, 100),
      save: fakeDirectory("save-guid", {
        container: fakeFileHandle("container.1", 30, 101),
        blob: fakeFileHandle("blob-guid", 40, 102),
      }),
    });
    const secondAccount = fakeDirectory("account_two", {
      index: fakeFileHandle("containers.index", 50, 200),
      blob: fakeFileHandle("other-blob", 60, 201),
    });
    const root = fakeDirectory("wgs", { firstAccount, secondAccount });

    const files = await readStableSaveDirectory(root, {
      platform: "xbox",
      accountId: "account_one",
      worldRootPath: "unused-for-xbox",
      stabilityDelayMs: 0,
    });

    expect(files.map(({ path }) => path).sort()).toEqual([
      "wgs/account_one/containers.index",
      "wgs/account_one/save-guid/blob-guid",
      "wgs/account_one/save-guid/container.1",
    ]);
  });
});

function fakeFileHandle(name: string, size: number, lastModified: number) {
  return {
    kind: "file",
    name,
    getFile: () => Promise.resolve({ name, size, lastModified } as File),
  } as FileSystemFileHandle;
}

function versionedFileHandle(
  name: string,
  versions: readonly (readonly [size: number, lastModified: number])[],
) {
  let calls = 0;
  return {
    handle: {
      kind: "file",
      name,
      getFile: () => {
        const [size, lastModified] = versions[Math.min(calls, versions.length - 1)];
        calls += 1;
        return Promise.resolve({ name, size, lastModified } as File);
      },
    } as FileSystemFileHandle,
    calls: () => calls,
  };
}

function fakeDirectory(
  name: string,
  children: Record<string, FileSystemHandle>,
) {
  return {
    kind: "directory",
    name,
    *values() {
      yield* Object.values(children);
    },
    getDirectoryHandle(childName: string) {
      const child = Object.values(children).find((entry) =>
        entry.kind === "directory" && entry.name === childName,
      );
      if (!child) throw new DOMException("Missing directory", "NotFoundError");
      return Promise.resolve(child as FileSystemDirectoryHandle);
    },
    getFileHandle(fileName: string) {
      const child = Object.values(children).find((entry) =>
        entry.kind === "file" && entry.name === fileName,
      );
      if (!child) throw new DOMException("Missing file", "NotFoundError");
      return Promise.resolve(child as FileSystemFileHandle);
    },
  } as unknown as FileSystemDirectoryHandle;
}

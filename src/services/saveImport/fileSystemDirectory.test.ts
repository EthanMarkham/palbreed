import { describe, expect, it } from "vitest";
import {
  fileSetSignature,
  fileSignature,
  getSteamWorldTrigger,
  getXboxAccountDirectory,
  readSaveDirectory,
  requestSaveDirectoryPermission,
  selectXboxAccountFiles,
} from "./fileSystemDirectory";

describe("persistent Steam folder access", () => {
  it("records stable paths and skips backup trees", async () => {
    const worldId = "33333333333333333333333333333333";
    const levelFile = fakeFileHandle("01.sav", 42, 100);
    const root = fakeDirectory("SaveGames", {
      account: fakeDirectory("account", {
        [worldId]: fakeDirectory(worldId, {
          LevelMeta: fakeFileHandle("LevelMeta.sav", 20, 90),
          Level: fakeDirectory("Level", { current: levelFile }),
          backup: fakeDirectory("backup", {
            ignored: fakeFileHandle("01.sav", 99, 999),
          }),
        }),
      }),
    });

    const files = await readSaveDirectory(root);

    expect(files.map(({ path }) => path).sort()).toEqual([
      `SaveGames/account/${worldId}/Level/01.sav`,
      `SaveGames/account/${worldId}/LevelMeta.sav`,
    ]);
    const trigger = await getSteamWorldTrigger(
      root,
      `SaveGames/account/${worldId}`,
    );
    expect(fileSignature(await trigger.getFile())).toBe("100:42");
  });

  it("reuses an already-authorized stored handle without prompting", async () => {
    let requestCount = 0;
    const directory = {
      queryPermission: () => Promise.resolve("granted" as PermissionState),
      requestPermission: () => {
        requestCount += 1;
        return Promise.resolve("granted" as PermissionState);
      },
    } as unknown as FileSystemDirectoryHandle;

    await expect(requestSaveDirectoryPermission(directory)).resolves.toBe("granted");
    expect(requestCount).toBe(0);
  });

  it("requests access on the stored handle instead of opening a new picker", async () => {
    let requestCount = 0;
    const directory = {
      queryPermission: () => Promise.resolve("prompt" as PermissionState),
      requestPermission: () => {
        requestCount += 1;
        return Promise.resolve("granted" as PermissionState);
      },
    } as unknown as FileSystemDirectoryHandle;

    await expect(requestSaveDirectoryPermission(directory)).resolves.toBe("granted");
    expect(requestCount).toBe(1);
  });
});

describe("persistent Xbox folder access", () => {
  it("derives the one account child from wgs without another picker", async () => {
    const account = fakeDirectory("account_one", {
      index: fakeFileHandle("containers.index", 20, 100),
    });
    const root = fakeDirectory("wgs", { account });

    await expect(getXboxAccountDirectory(root)).resolves.toMatchObject({
      directoryHandle: account,
      path: "wgs/account_one",
    });
    await expect(getXboxAccountDirectory(account)).resolves.toMatchObject({
      directoryHandle: account,
    });
  });

  it("fails closed when wgs contains multiple Xbox accounts", async () => {
    const root = fakeDirectory("wgs", {
      first: fakeDirectory("account_one", {
        index: fakeFileHandle("containers.index", 20, 100),
      }),
      second: fakeDirectory("account_two", {
        index: fakeFileHandle("containers.index", 20, 100),
      }),
    });

    await expect(getXboxAccountDirectory(root)).rejects.toThrow(
      "contains more than one Xbox account",
    );
  });

  it("fingerprints every file for only the imported WGS account", async () => {
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

    const files = await readSaveDirectory(root);
    const selected = selectXboxAccountFiles(files, "account_one");

    expect(selected.map(({ path }) => path).sort()).toEqual([
      "wgs/account_one/containers.index",
      "wgs/account_one/save-guid/blob-guid",
      "wgs/account_one/save-guid/container.1",
    ]);
    expect(fileSetSignature(selected)).not.toContain("account_two");
  });

  it("changes the fingerprint when an opaque WGS blob rotates", () => {
    const before = [{
      path: "wgs/account_one/save-guid/old-blob",
      file: { name: "old-blob", size: 40, lastModified: 100 } as File,
    }];
    const after = [{
      path: "wgs/account_one/save-guid/new-blob",
      file: { name: "new-blob", size: 40, lastModified: 100 } as File,
    }];

    expect(fileSetSignature(after)).not.toBe(fileSetSignature(before));
  });

  it("rejects a reconnect to a different Xbox account", async () => {
    const files = await readSaveDirectory(fakeDirectory("wgs", {
      account: fakeDirectory("account_two", {
        index: fakeFileHandle("containers.index", 20, 100),
      }),
    }));

    expect(() => selectXboxAccountFiles(files, "account_one")).toThrow(
      "does not contain the imported account",
    );
  });
});

function fakeFileHandle(name: string, size: number, lastModified: number) {
  return {
    kind: "file",
    name,
    getFile: () => Promise.resolve({ name, size, lastModified } as File),
  } as FileSystemFileHandle;
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

import { describe, expect, it } from "vitest";
import {
  fileSignature,
  getSteamWorldTrigger,
  readSaveDirectory,
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

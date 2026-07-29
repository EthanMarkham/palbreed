import { SaveImportError, type LogicalSaveFile } from "../../domain/saveImport";

const MAX_SELECTED_FILES = 25_000;
const MAX_DIRECTORY_DEPTH = 12;

type DirectoryPickerWindow = Window & {
  showDirectoryPicker(options?: { id?: string; mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
};

type PermissionDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
};

export function supportsPersistentSaveFolders() {
  return typeof window !== "undefined"
    && "showDirectoryPicker" in window
    && typeof indexedDB !== "undefined"
    && Boolean(navigator.locks);
}

export async function chooseSaveDirectory() {
  if (!supportsPersistentSaveFolders()) {
    throw new Error("Automatic refresh requires a current version of Chrome or Edge.");
  }
  return (window as unknown as DirectoryPickerWindow).showDirectoryPicker({
    id: "palpath-save-folder",
    mode: "read",
  });
}

export async function readSaveDirectory(
  directory: FileSystemDirectoryHandle,
  pathPrefix = directory.name,
): Promise<LogicalSaveFile[]> {
  const files: LogicalSaveFile[] = [];
  await visitDirectory(directory, normalizePath(pathPrefix), 0, files);
  return files;
}

export async function getWorldDirectory(
  selectedDirectory: FileSystemDirectoryHandle,
  worldRootPath: string,
) {
  const parts = normalizePath(worldRootPath).split("/").filter(Boolean);
  if (parts[0]?.toLocaleLowerCase() === selectedDirectory.name.toLocaleLowerCase()) {
    parts.shift();
  }

  let current = selectedDirectory;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part);
  }
  return current;
}

export async function getSteamWorldTrigger(
  selectedDirectory: FileSystemDirectoryHandle,
  worldRootPath: string,
) {
  const world = await getWorldDirectory(selectedDirectory, worldRootPath);
  const level = await world.getDirectoryHandle("Level");
  return level.getFileHandle("01.sav");
}

export async function getXboxSaveTrigger(selectedDirectory: FileSystemDirectoryHandle) {
  const trigger = await findFile(selectedDirectory, "containers.index", 0);
  if (!trigger) {
    throw new SaveImportError(
      "WRONG_FOLDER",
      "Choose the Xbox wgs folder that contains containers.index.",
    );
  }
  return trigger;
}

export function fileSignature(file: Pick<File, "lastModified" | "size">) {
  return `${file.lastModified}:${file.size}`;
}

export async function querySaveDirectoryPermission(directory: FileSystemDirectoryHandle) {
  const permissionHandle = directory as Partial<PermissionDirectoryHandle>;
  if (!permissionHandle.queryPermission) return "denied" as PermissionState;
  return permissionHandle.queryPermission({ mode: "read" });
}

async function visitDirectory(
  directory: FileSystemDirectoryHandle,
  path: string,
  depth: number,
  target: LogicalSaveFile[],
) {
  if (depth > MAX_DIRECTORY_DEPTH) {
    throw new SaveImportError("WRONG_FOLDER", "That folder is nested too deeply to be a Palworld save folder.");
  }

  for await (const entry of directory.values()) {
    const entryPath = joinPath(path, entry.name);
    if (entry.kind === "directory") {
      if (isBackupDirectory(entry.name)) continue;
      await visitDirectory(entry, entryPath, depth + 1, target);
      continue;
    }

    if (target.length >= MAX_SELECTED_FILES) {
      throw new SaveImportError(
        "WRONG_FOLDER",
        "That folder contains too many files. Choose the Palworld SaveGames folder or one world folder.",
      );
    }
    const file = await entry.getFile();
    target.push({ path: entryPath, file, updatedAt: file.lastModified });
  }
}

async function findFile(
  directory: FileSystemDirectoryHandle,
  fileName: string,
  depth: number,
): Promise<FileSystemFileHandle | undefined> {
  if (depth > MAX_DIRECTORY_DEPTH) return undefined;
  for await (const entry of directory.values()) {
    if (entry.kind === "file" && entry.name.toLowerCase() === fileName.toLowerCase()) return entry;
    if (entry.kind === "directory") {
      const found = await findFile(entry, fileName, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

function isBackupDirectory(name: string) {
  return /^(?:backup|backups|slot\d+)$/i.test(name);
}

function joinPath(...parts: string[]) {
  return parts.filter(Boolean).join("/").replace(/\/+/g, "/");
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

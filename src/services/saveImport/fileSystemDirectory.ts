import { SaveImportError, type LogicalSaveFile } from "../../domain/saveImport";

const MAX_SELECTED_FILES = 25_000;
const MAX_DIRECTORY_DEPTH = 12;

type DirectoryPickerWindow = Window & {
  showDirectoryPicker(options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: FileSystemHandle | string;
  }): Promise<FileSystemDirectoryHandle>;
};

type PermissionDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
};

export function supportsPersistentSaveFolders() {
  return typeof window !== "undefined"
    && "showDirectoryPicker" in window
    && typeof indexedDB !== "undefined";
}

export async function chooseSaveDirectory(
  platform?: "xbox" | "steam",
  startIn?: FileSystemDirectoryHandle,
) {
  if (!supportsPersistentSaveFolders()) {
    throw new Error("Automatic refresh requires a current version of Chrome or Edge.");
  }
  return (window as unknown as DirectoryPickerWindow).showDirectoryPicker({
    // Chromium remembers the last location for each picker ID. Keep Xbox and
    // Steam independent so changing a real source is less tedious.
    id: platform ? `palpath-${platform}-save-folder` : "palpath-save-folder",
    mode: "read",
    ...(startIn ? { startIn } : {}),
  });
}

export type XboxAccountDirectory = {
  directoryHandle: FileSystemDirectoryHandle;
  path: string;
};

/**
 * Finds the narrow WGS account directory that owns containers.index. Reading
 * and observing this child keeps Palpath out of unrelated Xbox app data.
 */
export async function getXboxAccountDirectory(
  selectedDirectory: FileSystemDirectoryHandle,
  accountId?: string,
): Promise<XboxAccountDirectory> {
  const accounts = await listXboxAccountDirectories(selectedDirectory);

  const matchingAccounts = accountId
    ? accounts.filter(({ directoryHandle, path }) =>
        directoryHandle.name.toLowerCase() === accountId.toLowerCase()
        || path.split("/").some((part) => part.toLowerCase() === accountId.toLowerCase()),
      )
    : accounts;

  if (!matchingAccounts.length) {
    throw new SaveImportError(
      "WRONG_FOLDER",
      accountId
        ? "This folder does not contain the connected Xbox account."
        : "No Xbox save account was found. Choose the wgs folder, or the long account folder inside it that contains containers.index.",
    );
  }
  if (matchingAccounts.length > 1) {
    throw new SaveImportError(
      "WRONG_FOLDER",
      "This wgs folder contains more than one Xbox account.",
    );
  }
  return matchingAccounts[0];
}

export async function listXboxAccountDirectories(
  selectedDirectory: FileSystemDirectoryHandle,
) {
  const accounts: XboxAccountDirectory[] = [];
  await walkXboxAccountDirectories(
    selectedDirectory,
    normalizePath(selectedDirectory.name),
    0,
    accounts,
  );
  return accounts;
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

export function fileSignature(file: Pick<File, "lastModified" | "size">) {
  return `${file.lastModified}:${file.size}`;
}

export function fileSetSignature(files: readonly LogicalSaveFile[]) {
  return [...files]
    .sort((left, right) => normalizePath(left.path).localeCompare(normalizePath(right.path)))
    .map(({ path, file }) =>
      `${normalizePath(path).toLowerCase()}\0${fileSignature(file)}`,
    )
    .join("\n");
}

export function selectXboxAccountFiles(
  files: readonly LogicalSaveFile[],
  accountId: string | undefined,
) {
  if (!accountId) return [...files];
  const normalizedAccountId = accountId.toLowerCase();
  const accountRoots = files.flatMap(({ path, file }) => {
    if (file.name.toLowerCase() !== "containers.index") return [];
    const normalized = normalizePath(path);
    const parts = normalized.split("/");
    if (!parts.some((part) => part.toLowerCase() === normalizedAccountId)) return [];
    return [dirname(normalized)];
  });
  if (!accountRoots.length) {
    throw new SaveImportError(
      "WRONG_FOLDER",
      "This Xbox save folder does not contain the imported account.",
    );
  }
  return files.filter(({ path }) =>
    accountRoots.some((root) => isInsideOrEqual(path, root)),
  );
}

export async function querySaveDirectoryPermission(directory: FileSystemDirectoryHandle) {
  const permissionHandle = directory as Partial<PermissionDirectoryHandle>;
  if (!permissionHandle.queryPermission) return "denied" as PermissionState;
  return permissionHandle.queryPermission({ mode: "read" });
}

export async function requestSaveDirectoryPermission(directory: FileSystemDirectoryHandle) {
  const permissionHandle = directory as Partial<PermissionDirectoryHandle>;
  if (!permissionHandle.queryPermission || !permissionHandle.requestPermission) {
    return "denied" as PermissionState;
  }

  const currentPermission = await permissionHandle.queryPermission({ mode: "read" });
  if (currentPermission === "granted") return currentPermission;
  return permissionHandle.requestPermission({ mode: "read" });
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

async function walkXboxAccountDirectories(
  directory: FileSystemDirectoryHandle,
  path: string,
  depth: number,
  target: XboxAccountDirectory[],
) {
  if (depth > MAX_DIRECTORY_DEPTH) return;
  const childDirectories: FileSystemDirectoryHandle[] = [];
  let containsIndex = false;

  for await (const entry of directory.values()) {
    if (entry.kind === "file" && entry.name.toLowerCase() === "containers.index") {
      containsIndex = true;
    } else if (entry.kind === "directory" && !isBackupDirectory(entry.name)) {
      childDirectories.push(entry);
    }
  }

  if (containsIndex) {
    target.push({ directoryHandle: directory, path });
    return;
  }
  for (const child of childDirectories) {
    await walkXboxAccountDirectories(
      child,
      joinPath(path, child.name),
      depth + 1,
      target,
    );
  }
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

function dirname(path: string) {
  const parts = normalizePath(path).split("/");
  parts.pop();
  return parts.join("/");
}

function isInsideOrEqual(path: string, root: string) {
  const normalizedPath = normalizePath(path).toLowerCase();
  const normalizedRoot = normalizePath(root).toLowerCase();
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

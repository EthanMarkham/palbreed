import {
  SaveImportError,
  type LogicalSaveFile,
  type SavePlatform,
} from "../../domain/saveImport";
import {
  fileSignature,
  getSteamWorldTrigger,
  getWorldDirectory,
  readSaveDirectory,
} from "./fileSystemDirectory";

const DEFAULT_STABILITY_DELAY_MS = 1_500;
const DEFAULT_STABILITY_ATTEMPTS = 3;

type StableSaveDirectoryOptions = {
  platform: SavePlatform;
  accountId?: string;
  worldRootPath: string;
  stabilityDelayMs?: number;
  stabilityAttempts?: number;
};

type RefreshSource = {
  signature: string;
  files?: readonly LogicalSaveFile[];
};

export async function readStableSaveDirectory(
  directory: FileSystemDirectoryHandle,
  options: StableSaveDirectoryOptions,
): Promise<LogicalSaveFile[]> {
  const delayMs = options.stabilityDelayMs ?? DEFAULT_STABILITY_DELAY_MS;
  const attempts = Math.max(1, options.stabilityAttempts ?? DEFAULT_STABILITY_ATTEMPTS);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const first = await readRefreshSource(directory, options);
    await delay(delayMs);
    const stable = await readRefreshSource(directory, options);
    if (first.signature !== stable.signature) continue;

    if (stable.files) return [...stable.files];
    const world = await getWorldDirectory(directory, options.worldRootPath);
    const files = await readSaveDirectory(world, options.worldRootPath);
    const finalTrigger = await getSteamWorldTrigger(directory, options.worldRootPath);
    if (fileSignature(await finalTrigger.getFile()) === stable.signature) return files;
  }

  throw new SaveImportError(
    "CORRUPT_SAVE",
    "The save changed while Palpath was reading it.",
  );
}

async function readRefreshSource(
  directory: FileSystemDirectoryHandle,
  options: StableSaveDirectoryOptions,
): Promise<RefreshSource> {
  if (options.platform === "steam") {
    const trigger = await getSteamWorldTrigger(directory, options.worldRootPath);
    return { signature: fileSignature(await trigger.getFile()) };
  }

  const files = selectXboxAccountFiles(
    await readSaveDirectory(directory),
    options.accountId,
  );
  return { signature: fileSetSignature(files), files };
}

function fileSetSignature(files: readonly LogicalSaveFile[]) {
  return [...files]
    .sort((left, right) => normalizePath(left.path).localeCompare(normalizePath(right.path)))
    .map(({ path, file }) =>
      `${normalizePath(path).toLowerCase()}\0${fileSignature(file)}`,
    )
    .join("\n");
}

function selectXboxAccountFiles(
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

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

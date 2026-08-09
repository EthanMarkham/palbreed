import {
  SaveImportError,
  type LogicalSaveFile,
  type SavePlatform,
} from "../../domain/saveImport";
import {
  fileSetSignature,
  getWorldDirectory,
  readSaveDirectory,
  selectXboxAccountFiles,
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
    const world = await getWorldDirectory(directory, options.worldRootPath);
    const files = await readSaveDirectory(world, options.worldRootPath);
    return { signature: fileSetSignature(files), files };
  }

  const files = selectXboxAccountFiles(
    await readSaveDirectory(directory),
    options.accountId,
  );
  return { signature: fileSetSignature(files), files };
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

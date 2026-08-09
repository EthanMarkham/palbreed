import {
  SaveImportError,
  type LogicalSaveFile,
  type SaveManifest,
  type SavePlatform,
  type SaveSlotCandidate,
} from "../../domain/saveImport";
import { pseudonymizeSourceAccountId } from "./sourceIdentity";

type ContainerIndexEntry = {
  name: string;
  number: number;
  folderGuid: string;
  createdAt: bigint;
};

export async function scanSaveSelection(
  selectedFiles: readonly File[],
  platform: SavePlatform,
): Promise<SaveManifest> {
  return scanLogicalSaveSelection(
    selectedFiles.map((file) => ({
      path: normalizePath(file.webkitRelativePath || file.name),
      file,
      updatedAt: file.lastModified,
    })),
    platform,
  );
}

export async function scanLogicalSaveSelection(
  selectedFiles: readonly LogicalSaveFile[],
  platform: SavePlatform,
): Promise<SaveManifest> {
  if (!selectedFiles.length) {
    throw new SaveImportError("WRONG_FOLDER", "Choose the save folder, not an individual save file.");
  }

  if (platform === "xbox" && xboxAccountRoots(selectedFiles).length > 1) {
    throw new SaveImportError(
      "WRONG_FOLDER",
      "This wgs folder contains more than one Xbox account. Choose the long account folder that directly contains containers.index so Palpath cannot mix worlds between accounts.",
    );
  }

  const logicalFiles = platform === "xbox"
    ? await extractXboxLogicalFiles(selectedFiles)
    : [...selectedFiles];
  const slots = buildSlotCandidates(logicalFiles);

  if (!slots.length) {
    throw new SaveImportError(
      "NO_WORLDS",
      platform === "xbox"
        ? "We couldn't find any Palworld worlds there. Choose the wgs folder that contains containers.index."
        : "We couldn't find any Palworld worlds there. Choose the SaveGames folder that contains your world folders.",
    );
  }

  if (slots.every(({ format }) => format !== "palworld-1.0")) {
    if (slots.some(({ format }) => format === "pre-1.0")) {
      throw new SaveImportError(
        "UNSUPPORTED_PRE_1_0",
        "This is an older Palworld save. Palpath currently imports Palworld 1.0 worlds only.",
      );
    }
    throw new SaveImportError(
      "UNSUPPORTED_1_0_REVISION",
      "We found save data, but it isn't in the Palworld 1.0 format Palpath can import.",
    );
  }

  const sourceAccountId = platform === "xbox"
    ? inferXboxAccountId(selectedFiles)
    : inferSteamAccountId(selectedFiles);
  return {
    platform,
    accountId: await pseudonymizeSourceAccountId(platform, sourceAccountId),
    sourceAccountId,
    slots,
  };
}

export function assertPalworldOnePointZero(slot: SaveSlotCandidate) {
  if (slot.format === "pre-1.0") {
    throw new SaveImportError(
      "UNSUPPORTED_PRE_1_0",
      `${slot.label} is an older save. Palpath currently imports Palworld 1.0 worlds only.`,
    );
  }
  if (slot.format !== "palworld-1.0") {
    throw new SaveImportError(
      "UNSUPPORTED_1_0_REVISION",
      `${slot.label} isn't in the Palworld 1.0 format Palpath can import.`,
    );
  }
}

async function extractXboxLogicalFiles(files: readonly LogicalSaveFile[]): Promise<LogicalSaveFile[]> {
  const filesByPath = new Map(
    files.map((file) => [normalizePath(file.path).toLowerCase(), file]),
  );
  const indexFiles = files.filter((file) =>
    normalizePath(file.path).toLowerCase().endsWith("/containers.index") ||
    file.file.name.toLowerCase() === "containers.index",
  );
  if (!indexFiles.length) {
    throw new SaveImportError(
      "WRONG_FOLDER",
      "Choose the Xbox wgs folder. This folder doesn't contain containers.index.",
    );
  }

  const logical: LogicalSaveFile[] = [];
  const missing: string[] = [];
  for (const indexFile of indexFiles) {
    const indexPath = normalizePath(indexFile.path);
    const accountRoot = indexPath.slice(0, Math.max(0, indexPath.lastIndexOf("/")));
    const parsedEntries = parseContainerIndex(await indexFile.file.arrayBuffer());
    const entries = [...new Map([...parsedEntries]
      .sort((left, right) =>
        left.name.localeCompare(right.name)
        || left.number - right.number
        || (left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0),
      )
      .map((entry) => [entry.name.toLowerCase(), entry] as const))
      .values()];

    for (const entry of entries) {
      const folderRoot = joinPath(accountRoot, entry.folderGuid);
      const containerPath = joinPath(folderRoot, `container.${entry.number}`).toLowerCase();
      const containerFile = filesByPath.get(containerPath);
      if (!containerFile) {
        missing.push(entry.name);
        continue;
      }

      let blobs: ReturnType<typeof parseContainerFile>;
      try {
        blobs = parseContainerFile(await containerFile.file.arrayBuffer());
      } catch (error) {
        throw new SaveImportError(
          "CORRUPT_SAVE",
          `Could not read container.${entry.number} for ${entry.name}: ${error instanceof Error ? error.message : "invalid container data"}.`,
        );
      }
      const candidatePair = blobs[0];
      const firstBlob = candidatePair
        ? filesByPath.get(joinPath(folderRoot, candidatePair.firstGuid).toLowerCase())
        : undefined;
      const secondBlob = candidatePair
        ? filesByPath.get(joinPath(folderRoot, candidatePair.secondGuid).toLowerCase())
        : undefined;
      if (
        firstBlob
        && secondBlob
        && candidatePair?.firstGuid !== candidatePair?.secondGuid
      ) {
        throw new SaveImportError(
          "INCOMPLETE_CLOUD_SYNC",
          `Xbox has two active copies of ${entry.name}. Wait for cloud sync to settle, then retry this same source.`,
        );
      }
      const blob = secondBlob ?? firstBlob;
      if (!blob) {
        missing.push(entry.name);
        continue;
      }

      logical.push({
        path: `${entry.name.replace(/-/g, "/")}.sav`,
        file: blob.file,
        updatedAt: blob.updatedAt,
      });
    }
  }

  if (missing.length) {
    throw new SaveImportError(
      "INCOMPLETE_CLOUD_SYNC",
      "Xbox is still rotating or downloading part of this save. Close Palworld, let Xbox cloud sync finish, then retry this same folder.",
    );
  }
  return logical;
}

function buildSlotCandidates(files: readonly LogicalSaveFile[]): SaveSlotCandidate[] {
  const roots = files.flatMap(({ path }) => {
    const lowerPath = path.toLowerCase();
    if (
      lowerPath.endsWith("/levelmeta.sav")
      || lowerPath === "levelmeta.sav"
      || lowerPath.endsWith("/level.sav")
      || lowerPath === "level.sav"
    ) {
      return [dirname(path)];
    }
    if (/(^|\/)level\/\d+\.sav$/i.test(path)) {
      return [dirname(dirname(path))];
    }
    return [];
  });

  const uniqueRoots = [...new Map(roots.map((root) => [root.toLowerCase(), root])).values()]
    .filter((root) => !isBackupRoot(root))
    .sort();
  const candidates = uniqueRoots.map((root, index) => {
    const relativeFiles = files.filter(({ path }) =>
      isInsideRoot(path, root) && !isBackupRoot(relativePath(path, root)),
    );
    const mapped = new Map(
      relativeFiles.map((entry) => [relativePath(entry.path, root).toLowerCase(), entry]),
    );
    const hasLevelMeta = mapped.has("levelmeta.sav");
    const hasModernLevel = mapped.has("level/01.sav");
    const hasLegacyLevel = mapped.has("level.sav");
    const worldId = root.split("/").find((part) => /^[a-f\d]{32}$/i.test(part)) ?? (root || `world-${index + 1}`);
    const format: SaveSlotCandidate["format"] = hasLevelMeta && hasModernLevel
      ? "palworld-1.0"
      : hasLegacyLevel
        ? "pre-1.0"
        : "unknown";
    const updatedAt = relativeFiles.reduce(
      (latest, entry) => Math.max(latest, entry.updatedAt ?? 0),
      0,
    );

    return {
      id: `${worldId}:current`,
      worldId,
      label: "",
      format,
      rootPath: root,
      updatedAt: updatedAt || undefined,
      files: mapped,
    };
  });

  return candidates
    .sort((first, second) => (second.updatedAt ?? 0) - (first.updatedAt ?? 0))
    .map((candidate, index) => ({ ...candidate, label: `World ${index + 1}` }));
}

export function parseContainerIndex(buffer: ArrayBuffer): readonly ContainerIndexEntry[] {
  try {
    const reader = new LittleEndianReader(buffer);
    const version = reader.int32();
    if (version !== 14) {
      throw new SaveImportError(
        "UNSUPPORTED_1_0_REVISION",
        `This Xbox container index uses unsupported format ${version}.`,
      );
    }
    const count = reader.int32();
    if (count < 0 || count > 100_000) throw new Error("Invalid container count.");
    reader.skip(4);
    reader.utf16();
    reader.skip(8);
    reader.skip(4);
    reader.utf16();
    reader.skip(8);

    const entries: ContainerIndexEntry[] = [];
    for (let index = 0; index < count; index += 1) {
      const name = reader.utf16();
      reader.utf16();
      reader.utf16();
      const number = reader.uint8();
      reader.skip(4);
      const folderGuid = reader.guidLittleEndian();
      const createdAt = reader.uint64();
      reader.skip(16);
      entries.push({ name, number, folderGuid, createdAt });
    }
    return entries;
  } catch (error) {
    if (error instanceof SaveImportError) throw error;
    throw new SaveImportError(
      "CORRUPT_SAVE",
      error instanceof Error ? `Could not read containers.index: ${error.message}` : "Could not read containers.index.",
    );
  }
}

function parseContainerFile(buffer: ArrayBuffer) {
  const reader = new LittleEndianReader(buffer);
  const version = reader.int32();
  if (version !== 4) throw new Error(`Unsupported container format ${version}.`);
  const count = reader.int32();
  if (count < 0 || count > 10_000) throw new Error("Invalid container file count.");
  const files = [];
  for (let index = 0; index < count; index += 1) {
    reader.utf16(64);
    files.push({
      firstGuid: reader.guidLittleEndian(),
      secondGuid: reader.guidLittleEndian(),
    });
  }
  return files;
}

class LittleEndianReader {
  private readonly view: DataView;
  private offset = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  skip(length: number) {
    this.ensure(length);
    this.offset += length;
  }

  int32() {
    this.ensure(4);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  uint8() {
    this.ensure(1);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  uint64() {
    this.ensure(8);
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  utf16(fixedLength?: number) {
    const length = fixedLength ?? this.int32();
    if (length < 0 || length > 1_000_000) throw new Error("Invalid UTF-16 string length.");
    const byteLength = length * 2;
    this.ensure(byteLength);
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, byteLength);
    this.offset += byteLength;
    return new TextDecoder("utf-16le").decode(bytes).replace(/\0+$/g, "");
  }

  guidLittleEndian() {
    this.ensure(16);
    const bytes = Array.from(new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, 16));
    this.offset += 16;
    const ordered = [
      bytes[3], bytes[2], bytes[1], bytes[0],
      bytes[5], bytes[4], bytes[7], bytes[6],
      ...bytes.slice(8),
    ];
    return ordered.map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  private ensure(length: number) {
    if (this.offset + length > this.view.byteLength) throw new Error("Unexpected end of file.");
  }
}

function inferXboxAccountId(files: readonly LogicalSaveFile[]) {
  const accountRoot = xboxAccountRoots(files)[0];
  const parts = accountRoot?.split("/").filter(Boolean) ?? [];
  return parts[parts.length - 1];
}

function xboxAccountRoots(files: readonly LogicalSaveFile[]) {
  return [...new Map(files.flatMap((file) => {
    if (file.file.name.toLowerCase() !== "containers.index") return [];
    const root = dirname(normalizePath(file.path));
    return [[root.toLowerCase(), root] as const];
  })).values()];
}

function inferSteamAccountId(files: readonly LogicalSaveFile[]) {
  for (const file of files) {
    const parts = normalizePath(file.path).split("/");
    const worldIndex = parts.findIndex((part) => /^[a-f\d]{32}$/i.test(part));
    if (worldIndex > 0) return parts[worldIndex - 1];
  }
  return undefined;
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function joinPath(...parts: string[]) {
  return parts.filter(Boolean).join("/").replace(/\/+/g, "/");
}

function dirname(path: string) {
  const split = normalizePath(path).split("/");
  split.pop();
  return split.join("/");
}

function isInsideRoot(path: string, root: string) {
  const normalized = normalizePath(path);
  return root ? normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`) : !normalized.includes("/");
}

function relativePath(path: string, root: string) {
  const normalized = normalizePath(path);
  return root ? normalized.slice(root.length + 1) : normalized;
}

function isBackupRoot(root: string) {
  return normalizePath(root).split("/").some((part) =>
    /^(?:backup|backups|slot\d+)$/i.test(part),
  );
}

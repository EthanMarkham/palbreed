import {
  SaveImportError,
  type LogicalSaveFile,
  type SaveManifest,
  type SavePlatform,
  type SaveSlotCandidate,
} from "../../domain/saveImport";

type ContainerIndexEntry = {
  name: string;
  number: number;
  folderGuid: string;
};

export async function scanSaveSelection(
  selectedFiles: readonly File[],
  platform: SavePlatform,
): Promise<SaveManifest> {
  if (!selectedFiles.length) {
    throw new SaveImportError("WRONG_FOLDER", "Choose the save folder, not an individual save file.");
  }

  const logicalFiles = platform === "xbox"
    ? await extractXboxLogicalFiles(selectedFiles)
    : extractSteamLogicalFiles(selectedFiles);
  const slots = buildSlotCandidates(logicalFiles);

  if (!slots.length) {
    throw new SaveImportError(
      "NO_WORLDS",
      platform === "xbox"
        ? "No Palworld worlds were found. Choose the wgs folder that contains containers.index."
        : "No Palworld worlds were found. Choose the SaveGames folder that contains world folders.",
    );
  }

  if (slots.every(({ format }) => format !== "palworld-1.0")) {
    if (slots.some(({ format }) => format === "pre-1.0")) {
      throw new SaveImportError(
        "UNSUPPORTED_PRE_1_0",
        "This world uses the pre-1.0 monolithic save format. Palpath only imports Palworld 1.0 worlds.",
      );
    }
    throw new SaveImportError(
      "UNSUPPORTED_1_0_REVISION",
      "The folder contains save data, but it does not match the supported Palworld 1.0 world layout.",
    );
  }

  return {
    platform,
    accountLabel: platform === "xbox" ? inferXboxAccountLabel(selectedFiles) : undefined,
    slots,
  };
}

export function assertPalworldOnePointZero(slot: SaveSlotCandidate) {
  if (slot.format === "pre-1.0") {
    throw new SaveImportError(
      "UNSUPPORTED_PRE_1_0",
      `${slot.label} is a pre-1.0 world. Only Palworld 1.0 worlds can be imported.`,
    );
  }
  if (slot.format !== "palworld-1.0") {
    throw new SaveImportError(
      "UNSUPPORTED_1_0_REVISION",
      `${slot.label} does not have the Palworld 1.0 LevelMeta.sav + Level/01.sav layout.`,
    );
  }
}

function extractSteamLogicalFiles(files: readonly File[]): LogicalSaveFile[] {
  return files.map((file) => ({
    path: normalizePath(file.webkitRelativePath || file.name),
    file,
    updatedAt: file.lastModified,
  }));
}

async function extractXboxLogicalFiles(files: readonly File[]): Promise<LogicalSaveFile[]> {
  const filesByPath = new Map(
    files.map((file) => [normalizePath(file.webkitRelativePath || file.name).toLowerCase(), file]),
  );
  const indexFiles = files.filter((file) =>
    normalizePath(file.webkitRelativePath || file.name).toLowerCase().endsWith("/containers.index") ||
    file.name.toLowerCase() === "containers.index",
  );
  if (!indexFiles.length) {
    throw new SaveImportError(
      "WRONG_FOLDER",
      "Xbox imports start at the wgs folder. The selected folder does not contain containers.index.",
    );
  }

  const logical: LogicalSaveFile[] = [];
  const missing: string[] = [];
  for (const indexFile of indexFiles) {
    const indexPath = normalizePath(indexFile.webkitRelativePath || indexFile.name);
    const accountRoot = indexPath.slice(0, Math.max(0, indexPath.lastIndexOf("/")));
    const entries = parseContainerIndex(await indexFile.arrayBuffer());

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
        blobs = parseContainerFile(await containerFile.arrayBuffer());
      } catch (error) {
        throw new SaveImportError(
          "CORRUPT_SAVE",
          `Could not read container.${entry.number} for ${entry.name}: ${error instanceof Error ? error.message : "invalid container data"}.`,
        );
      }
      const blob = blobs
        .flatMap(({ firstGuid, secondGuid }) => [firstGuid, secondGuid])
        .map((guid) => filesByPath.get(joinPath(folderRoot, guid).toLowerCase()))
        .find((candidate): candidate is File => Boolean(candidate));
      if (!blob) {
        missing.push(entry.name);
        continue;
      }

      logical.push({
        path: `${entry.name.replace(/-/g, "/")}.sav`,
        file: blob,
        updatedAt: blob.lastModified,
      });
    }
  }

  if (!logical.length && missing.length) {
    throw new SaveImportError(
      "INCOMPLETE_CLOUD_SYNC",
      "Xbox listed save containers whose data blobs are missing. Let cloud sync finish, close Palworld, and choose the folder again.",
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
    reader.skip(4);
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
      reader.skip(8);
      reader.skip(16);
      entries.push({ name, number, folderGuid });
    }
    return entries;
  } catch (error) {
    throw new SaveImportError(
      "CORRUPT_SAVE",
      error instanceof Error ? `Could not read containers.index: ${error.message}` : "Could not read containers.index.",
    );
  }
}

function parseContainerFile(buffer: ArrayBuffer) {
  const reader = new LittleEndianReader(buffer);
  reader.skip(4);
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

function inferXboxAccountLabel(files: readonly File[]) {
  const index = files.find((file) => file.name.toLowerCase() === "containers.index");
  const path = normalizePath(index?.webkitRelativePath ?? "");
  return path.split("/").find((part) => part.includes("_"));
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

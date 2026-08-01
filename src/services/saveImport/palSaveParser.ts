import aliases from "../../data/save-pal-aliases-1.0.json";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import type { OwnedPal, PalLocation } from "../../domain/inventory";
import {
  SaveImportError,
  type ImportedPlayer,
  type ImportPreview,
  type SaveSlotCandidate,
} from "../../domain/saveImport";
import type { PalGender, PalId } from "../../domain/pal";
import type { PassiveId } from "../../domain/passive";
import {
  normalizePalContainerSlotsFromParsedSave,
  normalizePalsFromParsedSave,
  normalizePlayerContainersFromParsedSave,
  normalizePlayersFromParsedSave,
} from "./palSaveNormalizer";
import { assertPalworldOnePointZero } from "./saveScanner";

const saveAliases: Readonly<Record<string, PalId>> = aliases.aliases;
const saveAliasesByNormalizedId = createNormalizedAliasMap(saveAliases);
const ignoredSaveIds = new Set<string>(aliases.ignoredIds.map(normalizeSaveId));
const MAX_COMPRESSED_SAVE_BYTES = 512 * 1024 * 1024;
const MAX_DECOMPRESSED_SAVE_BYTES = 1024 * 1024 * 1024;
let parserReady: Promise<typeof import("../../vendor/palpath-save-parser/palpath_save_parser")> | undefined;

export async function extractPalsFromSlot(slot: SaveSlotCandidate): Promise<ImportPreview> {
  assertPalworldOnePointZero(slot);
  const unknownPalIds = new Set<string>();
  const unknownPassiveIds = new Set<string>();
  const palsByInstance = new Map<string, OwnedPal>();
  const playersById = new Map<string, ImportedPlayer>();
  const parsedFiles: Array<{ path: string; parsed: unknown }> = [];
  const relevant = [...slot.files.entries()].filter(([path]) =>
    /^level\/\d+\.sav$/i.test(path) ||
    /^players\/.+\.sav$/i.test(path) ||
    /(^|\/)globalpalstorage\.sav$/i.test(path),
  );

  for (const [path, logical] of relevant) {
    let parsed: unknown;
    try {
      parsed = await parseSave(logical.file);
    } catch (error) {
      throw new SaveImportError(
        "CORRUPT_SAVE",
        `We couldn't read ${path}. ${error instanceof Error ? error.message : "The save data is invalid."}`,
      );
    }
    parsedFiles.push({ path, parsed });
  }

  const containerOwners = new Map<string, { location: "party" | "palbox"; playerId: string }>();
  const containerSlotByInstance = new Map<
    string,
    { slotIndex: number; containerId?: string }
  >();
  for (const { path, parsed } of parsedFiles) {
    const playerId = playerIdFromPath(path);
    for (const metadata of normalizePlayersFromParsedSave(parsed)) {
      const id = metadata.id ?? playerId;
      if (!id) continue;
      const existing = playersById.get(id);
      playersById.set(id, {
        id,
        name: metadata.name ?? existing?.name,
        level: metadata.level ?? existing?.level,
      });
    }
    if (playerId && !playersById.has(playerId)) {
      playersById.set(playerId, { id: playerId });
    }
    if (playerId) {
      const containers = normalizePlayerContainersFromParsedSave(parsed);
      addContainerOwner(containerOwners, containers.palboxContainerId, "palbox", playerId);
      addContainerOwner(containerOwners, containers.partyContainerId, "party", playerId);
    }
    for (const slot of normalizePalContainerSlotsFromParsedSave(parsed)) {
      containerSlotByInstance.set(normalizeGuid(slot.instanceId), {
        slotIndex: slot.slotIndex,
        containerId: slot.containerId,
      });
    }
  }

  for (const { path, parsed } of parsedFiles) {
    const pathPlayerId = playerIdFromPath(path);
    const candidates = normalizePalsFromParsedSave(parsed);
    for (const [index, candidate] of candidates.entries()) {
      const rawSpeciesId = candidate.speciesId;
      if (
        !rawSpeciesId
        || rawSpeciesId === "None"
        || rawSpeciesId.startsWith("Human")
        || /^player/i.test(rawSpeciesId)
      ) continue;
      if (ignoredSaveIds.has(normalizeSaveId(rawSpeciesId))) continue;
      const speciesId = resolveSpeciesId(rawSpeciesId);
      if (!speciesId) {
        unknownPalIds.add(rawSpeciesId);
        continue;
      }
      const gender = parseGender(candidate.gender);
      if (!gender) continue;
      const passiveIds = [...new Set(candidate.passiveIds.filter((id): id is PassiveId => {
        const known = Boolean(passiveRepository.get(id));
        if (!known) unknownPassiveIds.add(id);
        return known;
      }))];
      const instanceId = candidate.instanceId ?? `${path}:${speciesId}:${index}`;
      const authoritativeSlot = containerSlotByInstance.get(normalizeGuid(instanceId));
      const containerId = authoritativeSlot?.containerId ?? candidate.containerId;
      const containerOwner = containerId
        ? containerOwners.get(normalizeGuid(containerId))
        : undefined;
      const location = classifyPalLocation(path, containerOwner?.location);
      const playerId = pathPlayerId ?? containerOwner?.playerId;
      const normalizedInstance = instanceId.toLowerCase();
      const nextPal: OwnedPal = {
        id: `save:${slot.id}:${normalizedInstance}`,
        sourceInstanceId: normalizedInstance,
        speciesId,
        gender,
        passiveIds,
        location,
        palboxSlotIndex: resolvePalboxSlotIndex(
          location,
          authoritativeSlot?.slotIndex,
          candidate.containerSlotIndex,
        ),
        worldId: slot.worldId,
        playerId,
        nickname: candidate.nickname || undefined,
        level: candidate.level || undefined,
        abilityScores: candidate.abilityScores,
      };
      const existing = palsByInstance.get(normalizedInstance);
      palsByInstance.set(
        normalizedInstance,
        selectPreferredImportedPal(existing, nextPal),
      );
    }
  }

  return {
    slot,
    pals: [...palsByInstance.values()],
    players: [...playersById.values()].sort((first, second) => first.id.localeCompare(second.id)),
    unknownPalIds: [...unknownPalIds].sort(),
    unknownPassiveIds: [...unknownPassiveIds].sort(),
  };
}

function playerIdFromPath(path: string) {
  return /^players\/([^/]+)\.sav$/i.exec(path)?.[1]?.toLowerCase();
}

async function parseSave(file: File): Promise<unknown> {
  if (file.size > MAX_COMPRESSED_SAVE_BYTES) {
    throw new Error(`This save is too large to read safely (${formatMegabytes(file.size)} MB).`);
  }
  parserReady ??= import("../../vendor/palpath-save-parser/palpath_save_parser").then(async (module) => {
    await module.default();
    return module;
  });
  const parser = await parserReady;
  const bytes = await decompressOodleIfNeeded(new Uint8Array(await file.arrayBuffer()));
  return JSON.parse(parser.sav_to_json(bytes)) as unknown;
}

async function decompressOodleIfNeeded(data: Uint8Array) {
  const header = readCompressionHeader(data);
  if (!header || header.magic !== "PlM") return data;
  if (header.uncompressedLength <= 0 || header.uncompressedLength > MAX_DECOMPRESSED_SAVE_BYTES) {
    throw new Error(`This compressed save is too large to read safely (${formatMegabytes(header.uncompressedLength)} MB).`);
  }
  if (header.compressedLength <= 0 || header.dataOffset + header.compressedLength > data.length) {
    throw new Error("This save looks incomplete or corrupted.");
  }
  const { decompress } = await import("ooz-wasm");
  const payload = data.slice(header.dataOffset, header.dataOffset + header.compressedLength);
  const decompressed = decompress(payload, header.uncompressedLength);
  if (decompressed.length !== header.uncompressedLength) {
    throw new Error("This save could not be decompressed. It may be incomplete or corrupted.");
  }
  return new Uint8Array(decompressed);
}

function readCompressionHeader(data: Uint8Array) {
  if (data.length < 12) return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const outerMagic = ascii(data, 8, 11);
  const nested = outerMagic === "CNK";
  if (nested && data.length < 24) return undefined;
  const offset = nested ? 12 : 0;
  return {
    uncompressedLength: view.getUint32(offset, true),
    compressedLength: view.getUint32(offset + 4, true),
    magic: ascii(data, offset + 8, offset + 11),
    dataOffset: nested ? 24 : 12,
  };
}

function ascii(data: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...data.slice(start, end));
}

export function resolveSpeciesId(rawId: string) {
  const stripped = rawId.replace(/^(BOSS_|PREDATOR_|RAID_BOSS_)+/i, "");
  const alias = saveAliasesByNormalizedId.get(normalizeSaveId(rawId))
    ?? saveAliasesByNormalizedId.get(normalizeSaveId(stripped));
  return alias && breedingRepository.getPal(alias) ? alias : undefined;
}

function createNormalizedAliasMap(source: Readonly<Record<string, PalId>>) {
  const normalized = new Map<string, PalId>();
  for (const [saveId, canonicalId] of Object.entries(source)) {
    const key = normalizeSaveId(saveId);
    const existing = normalized.get(key);
    if (existing && existing !== canonicalId) {
      throw new Error(`Save aliases conflict for case-insensitive ID ${saveId}.`);
    }
    normalized.set(key, canonicalId);
  }
  return normalized;
}

function normalizeSaveId(value: string) {
  return value.toLocaleLowerCase("en-US");
}

function parseGender(value?: string): PalGender | undefined {
  if (!value) return undefined;
  if (/female/i.test(value)) return "F";
  if (/male/i.test(value)) return "M";
  return value === "F" || value === "M" ? value : undefined;
}

export function classifyPalLocation(
  path: string,
  containerLocation?: "party" | "palbox",
): PalLocation {
  if (/globalpalstorage/i.test(path)) return "global-storage";
  if (/players\//i.test(path)) return "party";
  if (containerLocation) return containerLocation;
  return "base";
}

export function resolvePalboxSlotIndex(
  location: PalLocation,
  authoritativeSlotIndex?: number,
  embeddedSlotIndex?: number,
) {
  return location === "palbox"
    ? authoritativeSlotIndex ?? embeddedSlotIndex
    : undefined;
}

function addContainerOwner(
  target: Map<string, { location: "party" | "palbox"; playerId: string }>,
  containerId: string | undefined,
  location: "party" | "palbox",
  playerId: string,
) {
  if (containerId) target.set(normalizeGuid(containerId), { location, playerId });
}

function normalizeGuid(value: string) {
  return value.replace(/[^a-f\d]/gi, "").toLocaleLowerCase();
}

function locationPriority(location: PalLocation) {
  return location === "party"
    ? 4
    : location === "global-storage"
      ? 3
      : location === "palbox"
        ? 2
        : 1;
}

export function selectPreferredImportedPal(
  existing: OwnedPal | undefined,
  candidate: OwnedPal,
) {
  if (!existing) return candidate;
  const priorityDifference = locationPriority(candidate.location)
    - locationPriority(existing.location);
  if (priorityDifference > 0) return enrichImportedPal(candidate, existing);
  if (priorityDifference < 0) return enrichImportedPal(existing, candidate);
  if (
    existing.location === "palbox"
    && existing.palboxSlotIndex !== undefined
    && candidate.palboxSlotIndex === undefined
  ) {
    return enrichImportedPal(existing, candidate);
  }
  return enrichImportedPal(candidate, existing);
}

function enrichImportedPal(preferred: OwnedPal, fallback: OwnedPal): OwnedPal {
  const passiveIds = preferred.passiveIds.length ? preferred.passiveIds : fallback.passiveIds;
  const nickname = preferred.nickname ?? fallback.nickname;
  const level = preferred.level ?? fallback.level;
  const abilityScores = preferred.abilityScores ?? fallback.abilityScores;
  if (
    passiveIds === preferred.passiveIds
    && nickname === preferred.nickname
    && level === preferred.level
    && abilityScores === preferred.abilityScores
  ) {
    return preferred;
  }
  return { ...preferred, passiveIds, nickname, level, abilityScores };
}

function formatMegabytes(bytes: number) {
  return Math.ceil(bytes / 1024 / 1024);
}

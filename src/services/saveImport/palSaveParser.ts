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
import { normalizePalsFromParsedSave, normalizePlayersFromParsedSave } from "./palSaveNormalizer";
import { assertPalworldOnePointZero } from "./saveScanner";

const saveAliases: Readonly<Record<string, PalId>> = aliases.aliases;
const ignoredSaveIds = new Set<string>(aliases.ignoredIds);
const MAX_COMPRESSED_SAVE_BYTES = 512 * 1024 * 1024;
const MAX_DECOMPRESSED_SAVE_BYTES = 1024 * 1024 * 1024;
let parserReady: Promise<typeof import("../../vendor/palpath-save-parser/palpath_save_parser")> | undefined;

export async function extractPalsFromSlot(slot: SaveSlotCandidate): Promise<ImportPreview> {
  assertPalworldOnePointZero(slot);
  const unknownPalIds = new Set<string>();
  const unknownPassiveIds = new Set<string>();
  const palsByInstance = new Map<string, OwnedPal>();
  const playersById = new Map<string, ImportedPlayer>();
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
        `Could not parse ${path}. ${error instanceof Error ? error.message : "The save data is invalid."}`,
      );
    }
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
    const candidates = normalizePalsFromParsedSave(parsed);
    for (const [index, candidate] of candidates.entries()) {
      const rawSpeciesId = candidate.speciesId;
      if (
        !rawSpeciesId
        || rawSpeciesId === "None"
        || rawSpeciesId.startsWith("Human")
        || /^player/i.test(rawSpeciesId)
      ) continue;
      if (ignoredSaveIds.has(rawSpeciesId)) continue;
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
      const location = inferLocation(path);
      const normalizedInstance = instanceId.toLowerCase();
      const nextPal: OwnedPal = {
        id: `save:${slot.id}:${normalizedInstance}`,
        sourceInstanceId: normalizedInstance,
        speciesId,
        gender,
        passiveIds,
        location,
        worldId: slot.worldId,
        playerId,
        nickname: candidate.nickname || undefined,
        level: candidate.level || undefined,
      };
      const existing = palsByInstance.get(normalizedInstance);
      palsByInstance.set(normalizedInstance, existing && locationPriority(existing.location) > locationPriority(location)
        ? existing
        : nextPal);
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
    throw new Error(`Save file is too large to decode safely (${formatMegabytes(file.size)} MB).`);
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
    throw new Error(`Oodle output length is outside the safe limit (${formatMegabytes(header.uncompressedLength)} MB).`);
  }
  if (header.compressedLength <= 0 || header.dataOffset + header.compressedLength > data.length) {
    throw new Error("The Oodle compression header has an invalid payload length.");
  }
  const { decompress } = await import("ooz-wasm");
  const payload = data.slice(header.dataOffset, header.dataOffset + header.compressedLength);
  const decompressed = decompress(payload, header.uncompressedLength);
  if (decompressed.length !== header.uncompressedLength) {
    throw new Error(`Oodle length mismatch: ${decompressed.length} != ${header.uncompressedLength}.`);
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

function resolveSpeciesId(rawId: string) {
  const stripped = rawId.replace(/^(BOSS_|PREDATOR_|RAID_BOSS_)+/i, "");
  const alias = saveAliases[rawId] ?? saveAliases[stripped];
  return alias && breedingRepository.getPal(alias) ? alias : undefined;
}

function parseGender(value?: string): PalGender | undefined {
  if (!value) return undefined;
  if (/female/i.test(value)) return "F";
  if (/male/i.test(value)) return "M";
  return value === "F" || value === "M" ? value : undefined;
}

function inferLocation(path: string): PalLocation {
  if (/globalpalstorage/i.test(path)) return "global-storage";
  if (/players\//i.test(path)) return "party";
  return "palbox";
}

function locationPriority(location: PalLocation) {
  return location === "party" ? 4 : location === "global-storage" ? 3 : location === "base" ? 2 : 1;
}

function formatMegabytes(bytes: number) {
  return Math.ceil(bytes / 1024 / 1024);
}

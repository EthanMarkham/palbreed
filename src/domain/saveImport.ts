import type { OwnedPal } from "./inventory";

export type SavePlatform = "xbox" | "steam";
export type SaveFormat = "palworld-1.0" | "pre-1.0" | "unknown";

export type LogicalSaveFile = {
  path: string;
  file: File;
  updatedAt?: number;
};

export type SaveSlotCandidate = {
  id: string;
  worldId: string;
  label: string;
  format: SaveFormat;
  updatedAt?: number;
  files: ReadonlyMap<string, LogicalSaveFile>;
};

export type SaveManifest = {
  platform: SavePlatform;
  accountId?: string;
  slots: readonly SaveSlotCandidate[];
};

export type ImportedPlayer = {
  id: string;
  name?: string;
  level?: number;
};

export type ImportPreview = {
  slot: SaveSlotCandidate;
  pals: readonly OwnedPal[];
  players: readonly ImportedPlayer[];
  unknownPalIds: readonly string[];
  unknownPassiveIds: readonly string[];
};

export type ImportErrorCode =
  | "WRONG_FOLDER"
  | "NO_WORLDS"
  | "UNSUPPORTED_PRE_1_0"
  | "INCOMPLETE_CLOUD_SYNC"
  | "UNSUPPORTED_1_0_REVISION"
  | "CORRUPT_SAVE";

export class SaveImportError extends Error {
  constructor(public readonly code: ImportErrorCode, message: string) {
    super(message);
    this.name = "SaveImportError";
  }
}

import type { PalGender, PalId } from "./pal";
import type { PassiveId } from "./passive";

export type PalLocation = "party" | "palbox" | "base" | "global-storage";
export type InventoryPlatform = "xbox" | "steam";
export const CURRENT_INVENTORY_NORMALIZATION_VERSION = 2;

export type InventoryOwner =
  | { kind: "anonymous"; id: string }
  | { kind: "account"; id: string };

export type PalAbilityScores = {
  hp: number;
  melee: number;
  ranged: number;
  defense: number;
};

export type OwnedPal = {
  id: string;
  sourceInstanceId: string;
  speciesId: PalId;
  gender: PalGender;
  passiveIds: readonly PassiveId[];
  location: PalLocation;
  /** Zero-based absolute slot in the in-game Palbox. */
  palboxSlotIndex?: number;
  worldId?: string;
  playerId?: string;
  nickname?: string;
  level?: number;
  abilityScores?: PalAbilityScores;
};

export type InventoryProfile = {
  id: string;
  owner: InventoryOwner;
  name: string;
  gameVersion: "1.0";
  platform: InventoryPlatform;
  worldId?: string;
  slotId?: string;
  accountId?: string;
  playerId?: string;
  playerName?: string;
  playerLevel?: number;
  importedAt?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  /** Version of the save-to-inventory normalization contract used for this import. */
  normalizationVersion: number;
  pals: readonly OwnedPal[];
};

export type InventoryDocument = {
  schemaVersion: 1;
  activeProfileId?: string;
  profiles: readonly InventoryProfile[];
};

export type InventorySnapshot = {
  status: "loading" | "ready" | "error";
  document: InventoryDocument;
  error?: string;
};

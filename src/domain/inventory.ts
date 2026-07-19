import type { PalGender, PalId } from "./pal";
import type { PassiveId } from "./passive";

export type PalLocation = "party" | "palbox" | "base" | "global-storage";
export type InventoryPlatform = "xbox" | "steam";

export type InventoryOwner =
  | { kind: "anonymous"; id: string }
  | { kind: "account"; id: string };

export type InventoryCloudBinding = {
  workspaceId: string;
  snapshotId: string;
  remoteRevision: number;
  localRevisionAtSync: number;
  syncedAt: string;
};

export type OwnedPal = {
  id: string;
  sourceInstanceId: string;
  speciesId: PalId;
  gender: PalGender;
  passiveIds: readonly PassiveId[];
  location: PalLocation;
  worldId?: string;
  playerId?: string;
  nickname?: string;
  level?: number;
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
  cloudBindings?: readonly InventoryCloudBinding[];
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

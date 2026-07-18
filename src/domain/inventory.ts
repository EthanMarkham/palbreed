import type { PalGender, PalId } from "./pal";
import type { PassiveId } from "./passive";

export type PalLocation = "party" | "palbox" | "base" | "global-storage" | "manual";
export type InventoryPlatform = "xbox" | "steam" | "manual";
export type InventorySource = "save" | "manual" | "session";

export type InventoryOwner =
  | { kind: "anonymous"; id: string }
  | { kind: "account"; id: string };

export type OwnedPal = {
  id: string;
  sourceInstanceId?: string;
  speciesId: PalId;
  gender: PalGender;
  passiveIds: readonly PassiveId[];
  location: PalLocation;
  source: InventorySource;
  included: boolean;
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
  playerId?: string;
  importedAt?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  pals: readonly OwnedPal[];
};

export type InventoryDocument = {
  schemaVersion: 1;
  activeProfileId: string;
  profiles: readonly InventoryProfile[];
};

export type InventorySnapshot = {
  status: "loading" | "ready" | "error";
  document: InventoryDocument;
  error?: string;
};

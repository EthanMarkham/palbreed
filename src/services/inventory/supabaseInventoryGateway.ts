import { z } from "zod";
import type { InventoryDocument, InventoryProfile, OwnedPal } from "../../domain/inventory";
import type { Database, Json } from "../supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryGateway } from "./inventoryGateway";

const ownedPalSchema = z.object({
  id: z.string(),
  sourceInstanceId: z.string(),
  speciesId: z.string(),
  gender: z.enum(["F", "M"]),
  passiveIds: z.array(z.string()),
  location: z.enum(["party", "palbox", "base", "global-storage"]),
  worldId: z.string().optional(),
  playerId: z.string().optional(),
  nickname: z.string().optional(),
  level: z.number().optional(),
});

const inventoryProfileSchema = z.object({
  id: z.string(),
  owner: z.object({ kind: z.literal("account"), id: z.string() }),
  name: z.string(),
  gameVersion: z.literal("1.0"),
  platform: z.enum(["xbox", "steam"]),
  worldId: z.string().optional(),
  slotId: z.string().optional(),
  accountId: z.string().optional(),
  playerId: z.string().optional(),
  playerName: z.string().optional(),
  playerLevel: z.number().optional(),
  importedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number(),
  pals: z.array(ownedPalSchema),
});

const inventoryDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  activeProfileId: z.string().nullish().transform((value) => value ?? undefined),
  profiles: z.array(inventoryProfileSchema),
});

export class SupabaseInventoryGateway implements InventoryGateway {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async load(): Promise<InventoryDocument | undefined> {
    const { data, error } = await this.client.rpc("get_inventory_document");
    if (error) throw requestError("load synced worlds", error);
    return inventoryDocumentSchema.parse(data);
  }

  async save(_ownerId: string, document: InventoryDocument): Promise<void> {
    for (const profile of document.profiles) {
      await this.replaceProfile(profile);
    }
  }

  async replaceProfile(profile: InventoryProfile): Promise<void> {
    const { error } = await this.client.rpc("replace_inventory_profile", {
      profile_local_id: profile.id,
      profile_name: profile.name,
      profile_game_version: profile.gameVersion,
      profile_platform: profile.platform,
      profile_world_id: profile.worldId ?? "",
      profile_slot_id: profile.slotId ?? "",
      profile_account_id: profile.accountId ?? null,
      profile_player_id: profile.playerId ?? null,
      profile_player_name: profile.playerName ?? null,
      profile_player_level: profile.playerLevel ?? null,
      imported_at: profile.importedAt ?? null,
      pal_records: profile.pals.map(toPalRecord) as Json,
    });
    if (error) throw requestError("sync the imported world", error);
  }

  async deleteProfile(profileId: string): Promise<void> {
    const { error } = await this.client.rpc("delete_inventory_profile", { profile_local_id: profileId });
    if (error) throw requestError("delete the synced world", error);
  }
}

function toPalRecord(pal: OwnedPal) {
  return {
    id: pal.id,
    sourceInstanceId: pal.sourceInstanceId,
    speciesId: pal.speciesId,
    gender: pal.gender,
    passiveIds: [...pal.passiveIds],
    location: pal.location,
    worldId: pal.worldId,
    playerId: pal.playerId,
    nickname: pal.nickname,
    level: pal.level,
  };
}

function requestError(action: string, error: { message: string }) {
  return new Error(`We couldn't ${action}. ${error.message}`);
}

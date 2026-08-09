import { describe, expect, it } from "vitest";
import type { InventoryProfile } from "../../domain/inventory";
import type { Database } from "../supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseInventoryGateway } from "./supabaseInventoryGateway";

describe("Supabase inventory privacy boundary", () => {
  it("never sends the raw Xbox save account folder identity", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc: (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return Promise.resolve({ error: null });
      },
    } as unknown as SupabaseClient<Database>;
    const rawAccountId = "0123456789ABCDEF_00112233445566778899AABBCCDDEEFF";
    const profile: InventoryProfile = {
      id: "profile-1",
      owner: { kind: "account", id: "owner-1" },
      name: "World",
      gameVersion: "1.0",
      platform: "xbox",
      worldId: "11111111111111111111111111111111",
      slotId: "slot-1",
      accountId: rawAccountId,
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
      revision: 1,
      normalizationVersion: 3,
      pals: [],
    };

    await new SupabaseInventoryGateway(client).replaceProfile(profile);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args.profile_account_id).toMatch(/^palpath-source-v1:[a-f\d]{64}$/);
    expect(JSON.stringify(calls[0]?.args)).not.toContain(rawAccountId);
  });
});

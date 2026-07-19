import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../services/supabase/database.types";
import type {
  BuilderHistoryBackend,
  BuilderHistoryEntry,
} from "./builderHistory";

const historyRowSchema = z.object({
  target_pal_id: z.string(),
  passive_ids: z.array(z.string()),
  objective: z.enum(["recommended", "fewest", "cleanest"]),
  allowed_extra_passives: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  searched_at: z.string(),
});

export class SupabaseBuilderHistoryBackend implements BuilderHistoryBackend {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async isAuthenticated() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw requestError("read the account session", error);
    return Boolean(data.session);
  }

  subscribeToAuth(listener: (authenticated: boolean) => void) {
    const { data } = this.client.auth.onAuthStateChange((_event, session: Session | null) => {
      listener(Boolean(session));
    });
    return () => data.subscription.unsubscribe();
  }

  async list(anonymousSessionToken?: string): Promise<readonly BuilderHistoryEntry[]> {
    const { data, error } = await this.client.rpc("list_recent_builder_searches", {
      anonymous_session_token: anonymousSessionToken ?? null,
      result_limit: 8,
    });
    if (error) throw requestError("load recent builds", error);
    return historyRowSchema.array().parse(data).map(toHistoryEntry);
  }

  async record(entry: BuilderHistoryEntry, anonymousSessionToken?: string) {
    const { error } = await this.client.rpc("record_builder_search", {
      search_target_pal_id: entry.targetId,
      search_passive_ids: entry.passives === "any" ? [] : [...entry.passives],
      search_objective: entry.objective,
      search_allowed_extra_passives: entry.allowedExtras,
      anonymous_session_token: anonymousSessionToken ?? null,
    });
    if (error) throw requestError("save the recent build", error);
  }

  async remove(entry: BuilderHistoryEntry, anonymousSessionToken?: string) {
    const { error } = await this.client.rpc("delete_recent_builder_search", {
      search_target_pal_id: entry.targetId,
      search_passive_ids: entry.passives === "any" ? [] : [...entry.passives],
      anonymous_session_token: anonymousSessionToken ?? null,
    });
    if (error) throw requestError("remove the recent build", error);
  }

  async clear(anonymousSessionToken?: string) {
    const { error } = await this.client.rpc("clear_recent_builder_searches", {
      anonymous_session_token: anonymousSessionToken ?? null,
    });
    if (error) throw requestError("clear recent builds", error);
  }

  async claim(anonymousSessionToken: string) {
    const { data, error } = await this.client.rpc("claim_recent_builder_searches", {
      anonymous_session_token: anonymousSessionToken,
    });
    if (error) throw requestError("move anonymous recent builds to the account", error);
    return data;
  }
}

function toHistoryEntry(row: z.infer<typeof historyRowSchema>): BuilderHistoryEntry {
  return {
    targetId: row.target_pal_id,
    passives: row.passive_ids.length ? row.passive_ids : "any",
    objective: row.objective,
    allowedExtras: row.allowed_extra_passives,
    searchedAt: row.searched_at,
  };
}

function requestError(action: string, error: { message: string }) {
  return new Error(`We couldn't ${action}. ${error.message}`);
}

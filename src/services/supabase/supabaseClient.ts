import { createClient } from "@supabase/supabase-js";
import { runtimeConfig } from "../../config/runtimeConfig";
import type { Database } from "./database.types";

const configuration = runtimeConfig.supabase;

export const supabaseClient = configuration
  ? createClient<Database>(configuration.url, configuration.publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : undefined;

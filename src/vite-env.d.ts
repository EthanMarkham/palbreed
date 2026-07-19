/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_AUTH_METHOD?: "discord" | "email" | "github" | "google";
  readonly VITE_LEGAL_CONTACT_EMAIL?: string;
  readonly VITE_SOURCE_URL?: string;
  readonly VITE_ADSENSE_ENABLED?: "true" | "false";
  readonly VITE_ADSENSE_PUBLISHER_ID?: string;
  readonly VITE_ADSENSE_BUILDER_SLOT?: string;
  readonly VITE_ADSENSE_TOOLS_SLOT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

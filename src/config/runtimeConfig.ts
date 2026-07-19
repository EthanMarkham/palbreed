export type SupportedOAuthProvider = "discord" | "github" | "google";

export type RuntimeConfig = {
  legalContactEmail?: string;
  sourceUrl?: string;
  supabase?: {
    url: string;
    publishableKey: string;
    oauthProvider: SupportedOAuthProvider;
  };
  adsense?: {
    publisherId: string;
    builderSlot: string;
    toolsSlot: string;
  };
  errors: readonly string[];
};

type Environment = Record<string, string | boolean | undefined>;

const PUBLISHER_ID = /^ca-pub-\d{16}$/;
const AD_SLOT_ID = /^\d{6,20}$/;
const OAUTH_PROVIDERS = new Set<SupportedOAuthProvider>(["discord", "github", "google"]);

export function createRuntimeConfig(environment: Environment): RuntimeConfig {
  const errors: string[] = [];
  const legalContactEmail = readString(environment.VITE_LEGAL_CONTACT_EMAIL);
  const sourceUrl = readString(environment.VITE_SOURCE_URL);
  if (legalContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(legalContactEmail)) {
    errors.push("VITE_LEGAL_CONTACT_EMAIL must be a valid email address.");
  }
  if (sourceUrl && !isHttpsUrl(sourceUrl)) {
    errors.push("VITE_SOURCE_URL must be a valid HTTPS URL.");
  }
  const supabaseUrl = readString(environment.VITE_SUPABASE_URL);
  const supabaseKey = readString(environment.VITE_SUPABASE_PUBLISHABLE_KEY);
  const configuredProvider = readString(environment.VITE_SUPABASE_OAUTH_PROVIDER) || "discord";
  let supabase: RuntimeConfig["supabase"];

  if (supabaseUrl || supabaseKey) {
    if (!supabaseUrl || !supabaseKey) {
      errors.push("Supabase requires both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
    } else if (!isHttpsUrl(supabaseUrl)) {
      errors.push("VITE_SUPABASE_URL must be a valid HTTPS URL.");
    } else if (!OAUTH_PROVIDERS.has(configuredProvider as SupportedOAuthProvider)) {
      errors.push("VITE_SUPABASE_OAUTH_PROVIDER must be discord, github, or google.");
    } else {
      supabase = {
        url: supabaseUrl,
        publishableKey: supabaseKey,
        oauthProvider: configuredProvider as SupportedOAuthProvider,
      };
    }
  }

  const adsEnabled = readString(environment.VITE_ADSENSE_ENABLED) === "true";
  const publisherId = readString(environment.VITE_ADSENSE_PUBLISHER_ID);
  const builderSlot = readString(environment.VITE_ADSENSE_BUILDER_SLOT);
  const toolsSlot = readString(environment.VITE_ADSENSE_TOOLS_SLOT);
  let adsense: RuntimeConfig["adsense"];

  if (adsEnabled) {
    if (!PUBLISHER_ID.test(publisherId)) {
      errors.push("VITE_ADSENSE_PUBLISHER_ID must use the ca-pub-################ format.");
    }
    if (!AD_SLOT_ID.test(builderSlot) || !AD_SLOT_ID.test(toolsSlot)) {
      errors.push("Both AdSense slot IDs are required when advertising is enabled.");
    }
    if (PUBLISHER_ID.test(publisherId) && AD_SLOT_ID.test(builderSlot) && AD_SLOT_ID.test(toolsSlot)) {
      adsense = { publisherId, builderSlot, toolsSlot };
    }
  }

  if (supabase && !legalContactEmail) {
    errors.push("VITE_LEGAL_CONTACT_EMAIL is required when cloud sync is enabled.");
  }
  if (adsense && !legalContactEmail) {
    errors.push("VITE_LEGAL_CONTACT_EMAIL is required before advertising can be enabled.");
    adsense = undefined;
  }
  if (adsense && !sourceUrl) {
    errors.push("VITE_SOURCE_URL is required before advertising can be enabled.");
    adsense = undefined;
  }

  return {
    legalContactEmail: legalContactEmail || undefined,
    sourceUrl: sourceUrl || undefined,
    supabase,
    adsense,
    errors,
  };
}

function readString(value: string | boolean | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export const runtimeConfig = createRuntimeConfig(import.meta.env);

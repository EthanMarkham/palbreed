export type SupportedSignInMethod = "discord" | "email" | "github" | "google";

export type RuntimeConfig = {
  legalContactEmail?: string;
  sourceUrl?: string;
  supabase?: {
    url: string;
    publishableKey: string;
    signInMethod: SupportedSignInMethod;
  };
  errors: readonly string[];
};

type Environment = Record<string, string | boolean | undefined>;

const SIGN_IN_METHODS = new Set<SupportedSignInMethod>(["discord", "email", "github", "google"]);

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
  const configuredSignInMethod = readString(environment.VITE_SUPABASE_AUTH_METHOD) || "email";
  let supabase: RuntimeConfig["supabase"];

  if (supabaseUrl || supabaseKey) {
    if (!supabaseUrl || !supabaseKey) {
      errors.push("Supabase requires both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
    } else if (!isHttpsUrl(supabaseUrl)) {
      errors.push("VITE_SUPABASE_URL must be a valid HTTPS URL.");
    } else if (!SIGN_IN_METHODS.has(configuredSignInMethod as SupportedSignInMethod)) {
      errors.push("VITE_SUPABASE_AUTH_METHOD must be email, discord, github, or google.");
    } else {
      supabase = {
        url: supabaseUrl,
        publishableKey: supabaseKey,
        signInMethod: configuredSignInMethod as SupportedSignInMethod,
      };
    }
  }

  if (supabase && !legalContactEmail) {
    errors.push("VITE_LEGAL_CONTACT_EMAIL is required when cloud sync is enabled.");
  }

  return {
    legalContactEmail: legalContactEmail || undefined,
    sourceUrl: sourceUrl || undefined,
    supabase,
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

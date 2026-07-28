export type SupportedSignInMethod = "email" | "google";

export type RuntimeConfig = {
  sourceUrl?: string;
  supabase?: {
    url: string;
    publishableKey: string;
    signInMethod: SupportedSignInMethod;
  };
  errors: readonly string[];
};

type Environment = Record<string, string | boolean | undefined>;

const SIGN_IN_METHODS = new Set<SupportedSignInMethod>(["email", "google"]);

export function createRuntimeConfig(environment: Environment): RuntimeConfig {
  const errors: string[] = [];
  const sourceUrl = readString(environment.VITE_SOURCE_URL);
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
      errors.push("VITE_SUPABASE_AUTH_METHOD must be email or google.");
    } else {
      supabase = {
        url: supabaseUrl,
        publishableKey: supabaseKey,
        signInMethod: configuredSignInMethod as SupportedSignInMethod,
      };
    }
  }

  return {
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

export const runtimeConfig = createRuntimeConfig({
  VITE_SOURCE_URL: import.meta.env.VITE_SOURCE_URL,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SUPABASE_AUTH_METHOD: import.meta.env.VITE_SUPABASE_AUTH_METHOD,
});

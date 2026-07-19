import { describe, expect, it } from "vitest";
import { createRuntimeConfig } from "./runtimeConfig";

describe("runtime configuration", () => {
  it("keeps optional services disabled when no environment is configured", () => {
    expect(createRuntimeConfig({})).toEqual({
      errors: [],
      legalContactEmail: undefined,
      sourceUrl: undefined,
    });
  });

  it("accepts a complete Supabase configuration", () => {
    expect(createRuntimeConfig({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      VITE_SUPABASE_AUTH_METHOD: "google",
      VITE_LEGAL_CONTACT_EMAIL: "privacy@example.com",
    })).toMatchObject({
      errors: [],
      supabase: { signInMethod: "google" },
    });
  });

  it("uses email magic links when no sign-in method is specified", () => {
    expect(createRuntimeConfig({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      VITE_LEGAL_CONTACT_EMAIL: "privacy@example.com",
    }).supabase?.signInMethod).toBe("email");
  });

  it("does not partially enable Supabase or AdSense", () => {
    const result = createRuntimeConfig({
      VITE_SUPABASE_URL: "http://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "key",
      VITE_ADSENSE_ENABLED: "true",
      VITE_ADSENSE_PUBLISHER_ID: "publisher",
    });

    expect(result.supabase).toBeUndefined();
    expect(result.adsense).toBeUndefined();
    expect(result.errors).toHaveLength(3);
  });

  it("keeps valid ad units disabled until legal contact and source are configured", () => {
    const result = createRuntimeConfig({
      VITE_ADSENSE_ENABLED: "true",
      VITE_ADSENSE_PUBLISHER_ID: "ca-pub-1234567890123456",
      VITE_ADSENSE_BUILDER_SLOT: "1234567890",
      VITE_ADSENSE_TOOLS_SLOT: "0987654321",
    });

    expect(result.adsense).toBeUndefined();
    expect(result.errors).toContain(
      "VITE_LEGAL_CONTACT_EMAIL is required before advertising can be enabled.",
    );
  });
});

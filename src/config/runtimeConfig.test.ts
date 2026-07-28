import { describe, expect, it } from "vitest";
import { createRuntimeConfig } from "./runtimeConfig";

describe("runtime configuration", () => {
  it("keeps optional services disabled when no environment is configured", () => {
    expect(createRuntimeConfig({})).toEqual({
      errors: [],
      sourceUrl: undefined,
    });
  });

  it("accepts a complete Supabase configuration", () => {
    expect(createRuntimeConfig({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      VITE_SUPABASE_AUTH_METHOD: "google",
    })).toMatchObject({
      errors: [],
      supabase: { signInMethod: "google" },
    });
  });

  it("uses email magic links when no sign-in method is specified", () => {
    expect(createRuntimeConfig({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    }).supabase?.signInMethod).toBe("email");
  });

  it("rejects unsupported sign-in methods", () => {
    const result = createRuntimeConfig({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      VITE_SUPABASE_AUTH_METHOD: "discord",
    });

    expect(result.supabase).toBeUndefined();
    expect(result.errors).toContain("VITE_SUPABASE_AUTH_METHOD must be email or google.");
  });

  it("does not partially enable Supabase", () => {
    const result = createRuntimeConfig({
      VITE_SUPABASE_URL: "http://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "key",
    });

    expect(result.supabase).toBeUndefined();
    expect(result.errors).toHaveLength(1);
  });
});

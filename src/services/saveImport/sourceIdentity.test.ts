import { describe, expect, it } from "vitest";
import { pseudonymizeSourceAccountId } from "./sourceIdentity";

describe("local save source privacy", () => {
  it("replaces a raw Xbox XUID/SCID folder name with a stable pseudonym", async () => {
    const raw = "0123456789ABCDEF_00112233445566778899AABBCCDDEEFF";
    const first = await pseudonymizeSourceAccountId("xbox", raw);
    const second = await pseudonymizeSourceAccountId("xbox", raw);

    expect(first).toBe(second);
    expect(first).toMatch(/^palpath-source-v1:[a-f\d]{64}$/);
    expect(first).not.toContain(raw);
  });

  it("domain-separates Xbox and Steam source identities", async () => {
    await expect(pseudonymizeSourceAccountId("xbox", "same-local-id"))
      .resolves.not.toBe(await pseudonymizeSourceAccountId("steam", "same-local-id"));
  });
});

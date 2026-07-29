import { describe, expect, it, vi } from "vitest";
import { createSessionApplier } from "./inventorySync";

describe("inventory session hydration", () => {
  it("coalesces duplicate initial-session signals", async () => {
    const apply = vi.fn(() => Promise.resolve());
    const applyUserId = createSessionApplier(apply);

    await Promise.all([
      applyUserId("account-1"),
      applyUserId("account-1"),
    ]);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith("account-1");
  });

  it("serializes genuine session changes", async () => {
    const applied: Array<string | undefined> = [];
    const applyUserId = createSessionApplier((userId) => {
      applied.push(userId);
      return Promise.resolve();
    });

    await Promise.all([
      applyUserId("account-1"),
      applyUserId(undefined),
      applyUserId("account-1"),
    ]);

    expect(applied).toEqual(["account-1", undefined, "account-1"]);
  });
});

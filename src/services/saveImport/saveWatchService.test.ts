import { describe, expect, it } from "vitest";
import { SaveImportError } from "../../domain/saveImport";
import { isTransientWatchError } from "./saveWatchService";

describe("Xbox save watch retry policy", () => {
  it("retries files that disappear during WGS blob rotation", () => {
    const error = new DOMException("The file moved.", "NotFoundError");

    expect(isTransientWatchError(error, "xbox")).toBe(true);
    expect(isTransientWatchError(error, "steam")).toBe(false);
  });

  it("retries incomplete Xbox snapshots without hiding permanent format errors", () => {
    expect(isTransientWatchError(
      new SaveImportError("INCOMPLETE_CLOUD_SYNC", "Still syncing."),
      "xbox",
    )).toBe(true);
    expect(isTransientWatchError(
      new SaveImportError("UNSUPPORTED_1_0_REVISION", "Incomplete snapshot."),
      "xbox",
    )).toBe(true);
    expect(isTransientWatchError(
      new SaveImportError("UNSUPPORTED_PRE_1_0", "Old save."),
      "xbox",
    )).toBe(false);
  });
});

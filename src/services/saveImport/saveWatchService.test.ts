import { describe, expect, it } from "vitest";
import { SaveImportError } from "../../domain/saveImport";
import { isTransientWatchError, watchAccessState } from "./saveWatchService";

describe("stored save handle access", () => {
  it("offers a one-click resume when Chromium pauses a retained handle", () => {
    expect(watchAccessState("prompt")).toEqual({
      status: "needs-permission",
      message: "Browser access is paused. Resume access to the remembered folder.",
    });
  });

  it("does not treat a retained, authorized handle as a missing folder", () => {
    expect(watchAccessState("granted").status).toBe("watching");
  });

  it("does not pretend blocked access can be resumed silently", () => {
    expect(watchAccessState("denied")).toEqual({
      status: "access-blocked",
      message: "Browser access is blocked. Allow this site to read local files or choose another source.",
    });
  });
});

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
    )).toBe(false);
    expect(isTransientWatchError(
      new SaveImportError("UNSUPPORTED_PRE_1_0", "Old save."),
      "xbox",
    )).toBe(false);
  });
});

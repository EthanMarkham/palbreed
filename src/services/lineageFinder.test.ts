import { describe, expect, it } from "vitest";
import { findLineage } from "./lineageFinder";

describe("Path Finder", () => {
  it("returns the shortest complete-table breeding path", () => {
    expect(findLineage("lamball", "daedream")).toEqual({
      status: "found",
      steps: [{
        from: "lamball",
        partner: "cattiva",
        result: "daedream",
        fromGender: "F",
        partnerGender: "M",
      }],
    });
  });

  it("handles a target that is already selected", () => {
    expect(findLineage("lamball", "lamball")).toEqual({ status: "same-pal" });
  });

  it("preserves species-specific parent sex requirements", () => {
    expect(findLineage("katress", "katress-ignis")).toEqual({
      status: "found",
      steps: [{
        from: "katress",
        partner: "wixen",
        result: "katress-ignis",
        fromGender: "F",
        partnerGender: "M",
      }],
    });
  });

  it("rejects unknown Pal identifiers", () => {
    expect(findLineage("not-a-pal", "lamball")).toEqual({
      status: "invalid-input",
      reason: "Choose a starting Pal and a target Pal.",
    });
  });
});

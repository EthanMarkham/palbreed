import { describe, expect, it } from "vitest";
import type { BuilderParent } from "../../services/builder/palBuilder";
import { getBuilderParentLocationLabel } from "./builderParentLocation";

const palboxParent: BuilderParent = {
  origin: "inventory",
  speciesId: "lamball",
  gender: "F",
  passives: { kind: "known", ids: [] },
  location: "palbox",
};

describe("builder parent location", () => {
  it("shows an exact Palbox page and slot when the import includes a slot index", () => {
    expect(getBuilderParentLocationLabel({ ...palboxParent, palboxSlotIndex: 65 })).toBe(
      "Palbox · Page 3 · Slot 6",
    );
  });

  it("keeps legacy synced imports useful without showing a dead-end re-import warning", () => {
    expect(getBuilderParentLocationLabel(palboxParent)).toBe("Palbox");
  });
});

import type { BuilderParent } from "../../services/builder/palBuilder";

export function getBuilderParentLocationLabel(parent: BuilderParent) {
  if (parent.origin === "planned") return "Breed earlier in this route";
  if (parent.location === "palbox") {
    if (parent.palboxSlotIndex === undefined) return "Palbox";
    const page = Math.floor(parent.palboxSlotIndex / 30) + 1;
    const slot = (parent.palboxSlotIndex % 30) + 1;
    return `Palbox · Page ${page} · Slot ${slot}`;
  }
  if (parent.location === "global-storage") return "Global storage";
  return parent.location === "party" ? "Party" : "Base";
}

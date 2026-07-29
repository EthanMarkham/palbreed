import type { ImportPreview, SaveManifest, SaveSlotCandidate } from "../../domain/saveImport";
import type { ImportedProfileInput } from "../inventory/inventoryService";
import { describeImportedWorld } from "./importedWorld";

export function createImportedProfileInput(
  manifest: Pick<SaveManifest, "platform" | "accountId">,
  slot: SaveSlotCandidate,
  preview: ImportPreview,
): ImportedProfileInput {
  const world = describeImportedWorld(slot.label, preview.players);
  return {
    name: world.name,
    platform: manifest.platform,
    worldId: slot.worldId,
    slotId: slot.id,
    accountId: manifest.accountId,
    playerId: world.player?.id,
    playerName: world.player?.name,
    playerLevel: world.player?.level,
    pals: preview.pals,
  };
}

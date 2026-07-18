import { describe, expect, it, vi } from "vitest";
import type { InventoryDocument } from "../../domain/inventory";
import type { InventoryGateway } from "./inventoryGateway";
import { InventoryService } from "./inventoryService";

class MemoryInventoryGateway implements InventoryGateway {
  document?: InventoryDocument;

  load() {
    return Promise.resolve(this.document);
  }

  save(_ownerId: string, document: InventoryDocument) {
    this.document = document;
    return Promise.resolve();
  }
}

describe("InventoryService persistence boundary", () => {
  it("re-imports the same world into one stable, replaceable profile", async () => {
    const gateway = new MemoryInventoryGateway();
    const service = new InventoryService(gateway, "owner-1");
    service.start();
    await vi.waitFor(() => expect(service.getSnapshot().status).toBe("ready"));

    service.replaceImportedProfile({
      name: "Current world",
      platform: "xbox",
      worldId: "world-1",
      slotId: "slot-1",
      pals: [{
        id: "pal-1",
        sourceInstanceId: "instance-1",
        speciesId: "lamball",
        gender: "F",
        passiveIds: [],
        location: "palbox",
        source: "save",
        included: true,
      }],
    });
    const importedProfileId = service.getActiveProfile().id;
    service.setPalIncluded("pal-1", false);
    service.upsertPal({
      id: "manual-1",
      speciesId: "chikipi",
      gender: "F",
      passiveIds: [],
      location: "manual",
      source: "manual",
      included: true,
    });

    service.replaceImportedProfile({
      name: "Current world",
      platform: "xbox",
      worldId: "world-1",
      slotId: "slot-1",
      pals: [
        {
          id: "pal-1-refreshed",
          sourceInstanceId: "instance-1",
          speciesId: "lamball",
          gender: "F",
          passiveIds: ["CraftSpeed_up2"],
          location: "palbox",
          source: "save",
          included: true,
        },
        {
          id: "pal-2",
          sourceInstanceId: "instance-2",
          speciesId: "cattiva",
          gender: "M",
          passiveIds: [],
          location: "palbox",
          source: "save",
          included: true,
        },
      ],
    });

    expect(service.getSnapshot().document.profiles).toHaveLength(2);
    expect(service.getActiveProfile()).toMatchObject({
      id: importedProfileId,
      revision: 4,
      pals: [
        { id: "pal-1-refreshed", sourceInstanceId: "instance-1", included: false },
        { id: "pal-2", sourceInstanceId: "instance-2" },
        { id: "manual-1", source: "manual" },
      ],
    });
    await vi.waitFor(() => expect(gateway.document?.activeProfileId).toBe(importedProfileId));
  });
});

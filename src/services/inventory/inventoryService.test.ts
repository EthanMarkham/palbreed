import { describe, expect, it, vi } from "vitest";
import type { InventoryDocument, OwnedPal } from "../../domain/inventory";
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

const lamball: OwnedPal = {
  id: "pal-1",
  sourceInstanceId: "instance-1",
  speciesId: "lamball",
  gender: "F",
  passiveIds: [],
  location: "palbox",
};

describe("InventoryService persistence boundary", () => {
  it("removes legacy manual profiles and locally added Pals during load", async () => {
    const gateway = new MemoryInventoryGateway();
    gateway.document = {
      schemaVersion: 1,
      activeProfileId: "manual-profile",
      profiles: [
        legacyProfile("manual-profile", "manual", []),
        legacyProfile("world-profile", "steam", [
          { ...lamball, source: "save", included: false },
          {
            ...lamball,
            id: "session-pal",
            sourceInstanceId: "session-pal",
            source: "session",
            included: true,
          },
        ]),
      ],
    } as unknown as InventoryDocument;
    const service = new InventoryService(gateway, "owner-1");
    service.start();

    await vi.waitFor(() => expect(service.getSnapshot().status).toBe("ready"));
    expect(service.getSnapshot().document).toMatchObject({
      activeProfileId: "world-profile",
      profiles: [{ id: "world-profile", pals: [lamball] }],
    });
  });

  it("re-imports the same world into one stable, replaceable profile", async () => {
    const gateway = new MemoryInventoryGateway();
    const service = new InventoryService(gateway, "owner-1");
    service.start();
    await vi.waitFor(() => expect(service.getSnapshot().status).toBe("ready"));

    service.replaceImportedProfile({
      name: "Ethan · Level 64",
      platform: "xbox",
      worldId: "world-1",
      slotId: "slot-1",
      accountId: "account-1",
      playerId: "player-1",
      playerName: "Ethan",
      playerLevel: 64,
      pals: [lamball],
    });
    const importedProfileId = service.getActiveProfile()?.id;

    service.replaceImportedProfile({
      name: "Ethan · Level 65",
      platform: "xbox",
      worldId: "world-1",
      slotId: "slot-1-refreshed",
      accountId: "account-1",
      playerId: "player-1",
      playerName: "Ethan",
      playerLevel: 65,
      pals: [{
        ...lamball,
        id: "pal-1-refreshed",
        passiveIds: ["CraftSpeed_up2"],
      }],
    });

    expect(service.getSnapshot().document.profiles).toHaveLength(1);
    expect(service.getActiveProfile()).toMatchObject({
      id: importedProfileId,
      name: "Ethan · Level 65",
      slotId: "slot-1-refreshed",
      revision: 2,
      pals: [{ id: "pal-1-refreshed", sourceInstanceId: "instance-1" }],
    });
    await vi.waitFor(() => expect(gateway.document?.activeProfileId).toBe(importedProfileId));
  });

  it("keeps generated Xbox world identifiers scoped to their accounts", async () => {
    const service = new InventoryService(new MemoryInventoryGateway(), "owner-1");
    service.start();
    await vi.waitFor(() => expect(service.getSnapshot().status).toBe("ready"));

    for (const accountId of ["account-1", "account-2"]) {
      service.replaceImportedProfile({
        name: accountId,
        platform: "xbox",
        worldId: "world-1",
        slotId: "world-1:current",
        accountId,
        pals: [lamball],
      });
    }

    expect(service.getSnapshot().document.profiles).toHaveLength(2);
  });

  it("removes a world and selects the next available import", async () => {
    const gateway = new MemoryInventoryGateway();
    const service = new InventoryService(gateway, "owner-1");
    service.start();
    await vi.waitFor(() => expect(service.getSnapshot().status).toBe("ready"));

    for (const worldId of ["first-world", "second-world"]) {
      service.replaceImportedProfile({
        name: worldId,
        platform: "steam",
        worldId,
        slotId: `${worldId}:current`,
        pals: [lamball],
      });
    }
    const secondId = service.getActiveProfile()?.id;
    service.removeProfile(secondId ?? "");

    expect(service.getSnapshot().document.profiles).toHaveLength(1);
    expect(service.getActiveProfile()?.worldId).toBe("first-world");
    await vi.waitFor(() => expect(gateway.document?.profiles).toHaveLength(1));
  });
});

function legacyProfile(id: string, platform: string, pals: readonly unknown[]) {
  return {
    id,
    owner: { kind: "anonymous", id: "owner-1" },
    name: id,
    gameVersion: "1.0",
    platform,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    revision: 0,
    pals,
  };
}

it("claims local profiles into an account sync gateway", async () => {
  const localGateway = new MemoryInventoryGateway();
  const syncGateway = new MemoryInventoryGateway();
  const service = new InventoryService(localGateway, "owner-1");
  service.start();
  await vi.waitFor(() => expect(service.getSnapshot().status).toBe("ready"));

  service.replaceImportedProfile({
    name: "Synced world",
    platform: "steam",
    worldId: "world-sync",
    slotId: "world-sync:current",
    pals: [lamball],
  });

  await service.enableAccountSync(syncGateway, "account-1");

  expect(service.getActiveProfile()?.owner).toEqual({ kind: "account", id: "account-1" });
  await vi.waitFor(() => expect(syncGateway.document?.profiles[0]?.owner).toEqual({ kind: "account", id: "account-1" }));
});

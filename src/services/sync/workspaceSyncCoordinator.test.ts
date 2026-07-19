import { describe, expect, it, vi } from "vitest";
import type {
  AccountProfile,
  AccountSyncState,
  CreatedWorkspaceInvite,
  RemoteWorldMetadata,
  RemoteWorldSnapshot,
  RemoteWriteResult,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceSummary,
} from "../../domain/account";
import type { InventoryDocument, OwnedPal } from "../../domain/inventory";
import type { AccountGateway } from "../account/accountGateway";
import type { InventoryGateway } from "../inventory/inventoryGateway";
import { InventoryService } from "../inventory/inventoryService";
import type { WorldSnapshotPayload } from "./worldSnapshot";
import { WorkspaceSyncCoordinator } from "./workspaceSyncCoordinator";

class MemoryInventoryGateway implements InventoryGateway {
  document?: InventoryDocument;
  load() { return Promise.resolve(this.document); }
  save(_ownerId: string, document: InventoryDocument) {
    this.document = document;
    return Promise.resolve();
  }
}

type StoredWorld = RemoteWorldSnapshot & { deletedAt?: string };

class MemoryAccountGateway implements AccountGateway {
  readonly worlds = new Map<string, StoredWorld>();

  ensureAccount() { return Promise.resolve(); }
  getProfile(): Promise<AccountProfile> { throw new Error("Not used by this test."); }
  updateDisplayName(): Promise<AccountProfile> { throw new Error("Not used by this test."); }
  listWorkspaces(): Promise<readonly WorkspaceSummary[]> { return Promise.resolve([]); }
  createTeamWorkspace(): Promise<string> { throw new Error("Not used by this test."); }
  listMembers(): Promise<readonly WorkspaceMember[]> { return Promise.resolve([]); }
  listInvites(): Promise<readonly WorkspaceInvite[]> { return Promise.resolve([]); }
  createInvite(): Promise<CreatedWorkspaceInvite> { throw new Error("Not used by this test."); }
  acceptInvite(): Promise<string> { throw new Error("Not used by this test."); }
  revokeInvite() { return Promise.resolve(); }
  setMemberRole() { return Promise.resolve(); }
  removeMember() { return Promise.resolve(); }

  listWorlds(workspaceId: string): Promise<readonly RemoteWorldMetadata[]> {
    return Promise.resolve([...this.worlds.values()]
      .filter((world) => world.workspaceId === workspaceId)
      .map((world) => ({
        snapshotId: world.snapshotId,
        identityKey: world.identityKey,
        name: world.name,
        platform: world.platform,
        gameVersion: world.gameVersion,
        schemaVersion: world.schemaVersion,
        revision: world.revision,
        importedAt: world.importedAt,
        updatedAt: world.updatedAt,
        deletedAt: world.deletedAt,
      })));
  }

  getWorld(snapshotId: string): Promise<RemoteWorldSnapshot> {
    const world = this.worlds.get(snapshotId);
    if (!world || world.deletedAt) throw new Error("World not found.");
    return Promise.resolve(world);
  }

  replaceWorld(input: {
    workspaceId: string;
    snapshotId: string;
    identityKey: string;
    expectedRevision: number;
    payload: WorldSnapshotPayload;
  }): Promise<RemoteWriteResult> {
    const existing = [...this.worlds.values()].find(
      (world) => world.workspaceId === input.workspaceId && world.identityKey === input.identityKey,
    );
    if (existing && existing.revision !== input.expectedRevision) {
      return Promise.resolve(resultFor(existing, false));
    }
    const now = new Date().toISOString();
    const saved: StoredWorld = {
      snapshotId: existing?.snapshotId ?? input.snapshotId,
      workspaceId: input.workspaceId,
      identityKey: input.identityKey,
      name: input.payload.name,
      platform: input.payload.platform,
      gameVersion: "1.0",
      schemaVersion: input.payload.schemaVersion,
      revision: (existing?.revision ?? 0) + 1,
      payload: input.payload,
      importedAt: input.payload.importedAt,
      updatedAt: now,
    };
    this.worlds.set(saved.snapshotId, saved);
    return Promise.resolve(resultFor(saved, true));
  }

  deleteWorld(snapshotId: string, expectedRevision: number): Promise<RemoteWriteResult> {
    const world = this.worlds.get(snapshotId);
    if (!world || world.revision !== expectedRevision) {
      return Promise.resolve(world ? resultFor(world, false) : { applied: false, revision: 0 });
    }
    const deleted = {
      ...world,
      name: "Deleted world",
      payload: {},
      revision: world.revision + 1,
      updatedAt: new Date().toISOString(),
      deletedAt: new Date().toISOString(),
    };
    this.worlds.set(snapshotId, deleted);
    return Promise.resolve(resultFor(deleted, true));
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

describe("workspace snapshot sync", () => {
  it("claims local worlds into a personal workspace once and records the remote revision", async () => {
    const { coordinator, inventory, remote } = await setup();
    await coordinator.activate({
      userId: "user-1",
      workspaceId: "personal-1",
      canWrite: true,
      claimUnbound: true,
    });

    expect(remote.worlds.size).toBe(1);
    expect(inventory.getActiveProfile()?.cloudBindings).toEqual([
      expect.objectContaining({ workspaceId: "personal-1", remoteRevision: 1 }),
    ]);
  });

  it("downloads a newer cloud snapshot when the local version is clean", async () => {
    const { coordinator, inventory, remote } = await setup();
    await coordinator.activate({
      userId: "user-1",
      workspaceId: "personal-1",
      canWrite: true,
      claimUnbound: true,
    });
    const stored = [...remote.worlds.values()][0];
    remote.worlds.set(stored.snapshotId, {
      ...stored,
      name: "Cloud name",
      revision: 2,
      payload: { ...(stored.payload as WorldSnapshotPayload), name: "Cloud name" },
    });

    await coordinator.syncNow();

    expect(inventory.getActiveProfile()?.name).toBe("Cloud name");
    expect(inventory.getActiveProfile()?.cloudBindings?.[0].remoteRevision).toBe(2);
  });

  it("surfaces a conflict instead of overwriting concurrent local and cloud changes", async () => {
    const states: string[] = [];
    const { coordinator, inventory, remote } = await setup((state) => states.push(state.status));
    await coordinator.activate({
      userId: "user-1",
      workspaceId: "personal-1",
      canWrite: true,
      claimUnbound: true,
    });
    inventory.replaceImportedProfile(importInput("Local change"));
    const stored = [...remote.worlds.values()][0];
    remote.worlds.set(stored.snapshotId, {
      ...stored,
      name: "Cloud change",
      revision: 2,
      payload: { ...(stored.payload as WorldSnapshotPayload), name: "Cloud change" },
    });

    await coordinator.syncNow();

    expect(states[states.length - 1]).toBe("conflict");
    expect(inventory.getActiveProfile()?.name).toBe("Local change");
  });

  it("zeroes the remote snapshot before removing the final local binding", async () => {
    const { coordinator, inventory, remote } = await setup();
    await coordinator.activate({
      userId: "user-1",
      workspaceId: "personal-1",
      canWrite: true,
      claimUnbound: true,
    });
    const profileId = inventory.getActiveProfile()?.id;
    await coordinator.removeProfile(profileId ?? "");

    expect(inventory.getDocument().profiles).toHaveLength(0);
    expect([...remote.worlds.values()][0]).toMatchObject({ payload: {}, name: "Deleted world" });
  });

  it("does not report a viewer's unsynced local edit as synchronized", async () => {
    let latestState: AccountSyncState | undefined;
    const { coordinator, inventory } = await setup((state) => { latestState = state; });
    await coordinator.activate({
      userId: "user-1",
      workspaceId: "personal-1",
      canWrite: true,
      claimUnbound: true,
    });
    coordinator.deactivate();
    inventory.replaceImportedProfile(importInput("Viewer edit"));

    await coordinator.activate({
      userId: "user-1",
      workspaceId: "personal-1",
      canWrite: false,
      claimUnbound: false,
    });

    expect(latestState?.status).toBe("conflict");
    expect(latestState?.conflicts[0]?.kind).toBe("read-only-local-change");
  });
});

async function setup(onState: (state: AccountSyncState) => void = () => undefined) {
  const inventory = new InventoryService(new MemoryInventoryGateway(), "device-1");
  inventory.start();
  await vi.waitFor(() => expect(inventory.getSnapshot().status).toBe("ready"));
  inventory.replaceImportedProfile(importInput("Local world"));
  const remote = new MemoryAccountGateway();
  return {
    inventory,
    remote,
    coordinator: new WorkspaceSyncCoordinator(inventory, remote, onState),
  };
}

function importInput(name: string) {
  return {
    name,
    platform: "xbox" as const,
    worldId: "world-1",
    slotId: "slot-1",
    accountId: "account-1",
    pals: [lamball],
  };
}

function resultFor(world: StoredWorld, applied: boolean): RemoteWriteResult {
  return {
    applied,
    snapshotId: world.snapshotId,
    revision: world.revision,
    updatedAt: world.updatedAt,
    deletedAt: world.deletedAt,
  };
}

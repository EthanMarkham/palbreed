import { describe, expect, it } from "vitest";
import type { InventoryProfile } from "../../domain/inventory";
import {
  profileToWorldSnapshot,
  worldIdentityKey,
  worldSnapshotToProfile,
} from "./worldSnapshot";

const profile: InventoryProfile = {
  id: "profile-1",
  owner: { kind: "anonymous", id: "device-1" },
  name: "Shared world",
  gameVersion: "1.0",
  platform: "xbox",
  worldId: "world-1",
  accountId: "account-1",
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
  revision: 3,
  pals: [],
};

describe("world snapshot DTO", () => {
  it("keeps cloud bookkeeping out of the remote payload", () => {
    const payload = profileToWorldSnapshot({
      ...profile,
      cloudBindings: [{
        workspaceId: "workspace-1",
        snapshotId: "snapshot-1",
        remoteRevision: 2,
        localRevisionAtSync: 3,
        syncedAt: "2026-07-19T00:00:00.000Z",
      }],
    });

    expect(payload).not.toHaveProperty("cloudBindings");
    expect(worldSnapshotToProfile(payload, "user-1", {
      workspaceId: "workspace-1",
      snapshotId: "snapshot-1",
      remoteRevision: 2,
      localRevisionAtSync: 3,
      syncedAt: "2026-07-19T00:00:00.000Z",
    })).toMatchObject({ owner: { kind: "account", id: "user-1" }, revision: 3 });
  });

  it("scopes generated world identifiers to the source account", () => {
    expect(worldIdentityKey(profile)).not.toBe(worldIdentityKey({
      ...profile,
      accountId: "account-2",
    }));
  });
});

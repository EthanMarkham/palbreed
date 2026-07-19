import type {
  AccountSyncState,
  RemoteWorldMetadata,
  SyncConflict,
} from "../../domain/account";
import type { InventoryCloudBinding, InventoryProfile } from "../../domain/inventory";
import type { AccountGateway } from "../account/accountGateway";
import type { InventoryService } from "../inventory/inventoryService";
import {
  profileToWorldSnapshot,
  worldIdentityKey,
  worldSnapshotToProfile,
} from "./worldSnapshot";

type ActiveWorkspace = {
  userId: string;
  workspaceId: string;
  canWrite: boolean;
  claimUnbound: boolean;
  generation: number;
};

const initialState: AccountSyncState = { status: "idle", conflicts: [] };

export class WorkspaceSyncCoordinator {
  private active?: ActiveWorkspace;
  private generation = 0;
  private queue = Promise.resolve();
  private state: AccountSyncState = initialState;

  constructor(
    private readonly inventory: InventoryService,
    private readonly gateway: AccountGateway,
    private readonly onStateChange: (state: AccountSyncState) => void,
  ) {}

  activate(input: Omit<ActiveWorkspace, "generation">) {
    const generation = ++this.generation;
    this.active = { ...input, generation };
    return this.enqueue(() => this.syncAll(generation));
  }

  deactivate() {
    this.generation += 1;
    this.active = undefined;
    this.setState(initialState);
  }

  syncNow() {
    const generation = this.active?.generation;
    return generation === undefined ? Promise.resolve() : this.enqueue(() => this.syncAll(generation));
  }

  syncChangedProfile(profile: InventoryProfile) {
    const generation = this.active?.generation;
    if (generation === undefined || !this.active?.canWrite) return;
    void this.enqueue(async () => {
      if (!this.isCurrent(generation)) return;
      this.setState({ ...this.state, status: "syncing", error: undefined });
      await this.uploadProfile(profile, generation);
      this.finishSync();
    }).catch(() => undefined);
  }

  syncProfileToActive(profileId: string) {
    const profile = this.inventory.getDocument().profiles.find(({ id }) => id === profileId);
    const generation = this.active?.generation;
    if (!profile || generation === undefined || !this.active?.canWrite) {
      return Promise.reject(new Error("Choose an editable workspace before syncing this world."));
    }
    const operation = this.enqueue(async () => {
      this.setState({ ...this.state, status: "syncing", error: undefined });
      await this.uploadProfile(profile, generation);
      this.finishSync();
    });
    return operation.then(() => {
      if (this.state.conflicts.some((conflict) => conflict.localProfileId === profileId)) {
        throw new Error("This world changed in the workspace. Resolve the conflict before syncing it again.");
      }
    });
  }

  removeProfile(profileId: string) {
    const profile = this.inventory.getDocument().profiles.find(({ id }) => id === profileId);
    const active = this.active;
    if (!profile) return Promise.resolve();
    const binding = active ? bindingFor(profile, active.workspaceId) : undefined;
    if (!binding) {
      this.inventory.removeProfile(profileId);
      return Promise.resolve();
    }
    if (!active?.canWrite) {
      return Promise.reject(new Error("Viewers cannot remove worlds from this workspace."));
    }

    const operation = this.enqueue(async () => {
      this.setState({ ...this.state, status: "syncing", error: undefined });
      const result = await this.gateway.deleteWorld(binding.snapshotId, binding.remoteRevision);
      if (!result.applied) {
        this.addConflict(profile, {
          snapshotId: result.snapshotId ?? binding.snapshotId,
          revision: result.revision,
          deletedAt: result.deletedAt,
        });
        return;
      }
      const remainingBindings = this.inventory.unbindProfileFromCloud(profileId, active.workspaceId);
      if (!remainingBindings) this.inventory.removeProfile(profileId);
      this.removeConflict(profileId);
      this.finishSync();
    });
    return operation.then(() => {
      const current = this.inventory.getDocument().profiles.find(({ id }) => id === profileId);
      if (current && bindingFor(current, active.workspaceId)) {
        throw new Error("This world changed in the workspace and was not removed. Resolve the conflict first.");
      }
    });
  }

  useCloud(localProfileId: string) {
    const conflict = this.state.conflicts.find((candidate) => candidate.localProfileId === localProfileId);
    const active = this.active;
    if (!conflict || !active) return Promise.resolve();
    return this.enqueue(async () => {
      if (conflict.kind === "deleted-remotely") {
        const remaining = this.inventory.unbindProfileFromCloud(localProfileId, active.workspaceId);
        if (!remaining) this.inventory.removeProfile(localProfileId);
      } else {
        await this.downloadWorld(conflict.remoteSnapshotId, localProfileId, active);
      }
      this.removeConflict(localProfileId);
      this.finishSync();
    });
  }

  keepLocal(localProfileId: string) {
    const conflict = this.state.conflicts.find((candidate) => candidate.localProfileId === localProfileId);
    const active = this.active;
    const profile = this.inventory.getDocument().profiles.find(({ id }) => id === localProfileId);
    if (!conflict || !active || !profile || !active.canWrite) return Promise.resolve();
    return this.enqueue(async () => {
      const applied = await this.uploadProfile(profile, active.generation, {
        snapshotId: conflict.remoteSnapshotId,
        expectedRevision: conflict.remoteRevision,
      });
      if (applied) this.removeConflict(localProfileId);
      this.finishSync();
    });
  }

  private async syncAll(generation: number) {
    if (!this.isCurrent(generation)) return;
    this.setState({ status: "syncing", conflicts: [] });
    try {
      await this.inventory.whenReady();
      const active = this.active;
      if (!active || !this.isCurrent(generation)) return;
      const remoteWorlds = await this.gateway.listWorlds(active.workspaceId);
      if (!this.isCurrent(generation)) return;
      const remoteById = new Map(remoteWorlds.map((world) => [world.snapshotId, world]));
      const remoteByIdentity = new Map(remoteWorlds.map((world) => [world.identityKey, world]));
      const blockedIdentities = new Set<string>();

      for (const localProfile of [...this.inventory.getDocument().profiles]) {
        const binding = bindingFor(localProfile, active.workspaceId);
        if (!binding) continue;
        const remote = remoteById.get(binding.snapshotId)
          ?? remoteByIdentity.get(worldIdentityKey(localProfile));
        if (!remote) {
          if (active.canWrite) await this.uploadProfile(localProfile, generation, { expectedRevision: 0 });
          continue;
        }
        blockedIdentities.add(remote.identityKey);
        await this.reconcileBoundProfile(localProfile, binding, remote, active);
      }

      for (const remote of remoteWorlds) {
        if (remote.deletedAt || blockedIdentities.has(remote.identityKey)) continue;
        const matchingLocal = this.inventory.getDocument().profiles.find(
          (profile) => worldIdentityKey(profile) === remote.identityKey,
        );
        if (matchingLocal) {
          this.addConflict(matchingLocal, remote);
          blockedIdentities.add(remote.identityKey);
        } else {
          await this.downloadWorld(remote.snapshotId, undefined, active);
        }
      }

      if (active.claimUnbound && active.canWrite) {
        for (const profile of [...this.inventory.getDocument().profiles]) {
          if (bindingFor(profile, active.workspaceId)) continue;
          if (blockedIdentities.has(worldIdentityKey(profile))) continue;
          await this.uploadProfile(profile, generation);
        }
      }
      this.finishSync();
    } catch (error) {
      this.failSync(error);
    }
  }

  private async reconcileBoundProfile(
    profile: InventoryProfile,
    binding: InventoryCloudBinding,
    remote: RemoteWorldMetadata,
    active: ActiveWorkspace,
  ) {
    const changedLocally = profile.revision > binding.localRevisionAtSync;
    const changedRemotely = remote.revision > binding.remoteRevision;

    if (remote.deletedAt) {
      if (changedLocally && changedRemotely) this.addConflict(profile, remote);
      else {
        const remaining = this.inventory.unbindProfileFromCloud(profile.id, active.workspaceId);
        if (!remaining) this.inventory.removeProfile(profile.id);
      }
      return;
    }
    if (changedLocally && changedRemotely) {
      this.addConflict(profile, remote);
    } else if (changedRemotely) {
      await this.downloadWorld(remote.snapshotId, profile.id, active);
    } else if (changedLocally) {
      if (active.canWrite) await this.uploadProfile(profile, active.generation);
      else this.addConflict(profile, remote, "read-only-local-change");
    }
  }

  private async downloadWorld(
    snapshotId: string,
    localProfileId: string | undefined,
    active: ActiveWorkspace,
  ) {
    const remote = await this.gateway.getWorld(snapshotId);
    if (!this.isCurrent(active.generation)) return;
    const existing = localProfileId
      ? this.inventory.getDocument().profiles.find(({ id }) => id === localProfileId)
      : undefined;
    const payload = remote.payload as { localRevision?: unknown };
    const localRevisionAtSync = typeof payload.localRevision === "number" ? payload.localRevision : 0;
    const cloudBinding: InventoryCloudBinding = {
      workspaceId: active.workspaceId,
      snapshotId: remote.snapshotId,
      remoteRevision: remote.revision,
      localRevisionAtSync,
      syncedAt: new Date().toISOString(),
    };
    const profile = worldSnapshotToProfile(
      remote.payload,
      active.userId,
      cloudBinding,
      existing?.cloudBindings,
    );
    this.inventory.replaceProfileFromCloud(localProfileId, profile);
  }

  private async uploadProfile(
    profile: InventoryProfile,
    generation: number,
    override?: { snapshotId?: string; expectedRevision?: number },
  ) {
    const active = this.active;
    if (!active || !active.canWrite || !this.isCurrent(generation)) return false;
    const binding = bindingFor(profile, active.workspaceId);
    const snapshotId = override?.snapshotId ?? binding?.snapshotId ?? createId();
    const result = await this.gateway.replaceWorld({
      workspaceId: active.workspaceId,
      snapshotId,
      identityKey: worldIdentityKey(profile),
      expectedRevision: override?.expectedRevision ?? binding?.remoteRevision ?? 0,
      payload: profileToWorldSnapshot(profile),
    });
    if (!this.isCurrent(generation)) return false;
    if (!result.applied || !result.snapshotId) {
      this.addConflict(profile, {
        snapshotId: result.snapshotId ?? snapshotId,
        revision: result.revision,
        deletedAt: result.deletedAt,
      });
      return false;
    }
    this.inventory.bindProfileToCloud(profile.id, {
      workspaceId: active.workspaceId,
      snapshotId: result.snapshotId,
      remoteRevision: result.revision,
      localRevisionAtSync: profile.revision,
      syncedAt: result.updatedAt ?? new Date().toISOString(),
    });
    return true;
  }

  private addConflict(
    profile: InventoryProfile,
    remote: Pick<RemoteWorldMetadata, "snapshotId" | "revision" | "deletedAt">,
    kind: SyncConflict["kind"] = remote.deletedAt ? "deleted-remotely" : "both-changed",
  ) {
    const conflict: SyncConflict = {
      localProfileId: profile.id,
      worldName: profile.name,
      remoteSnapshotId: remote.snapshotId,
      remoteRevision: remote.revision,
      kind,
    };
    this.setState({
      ...this.state,
      status: "conflict",
      conflicts: [
        ...this.state.conflicts.filter(({ localProfileId }) => localProfileId !== profile.id),
        conflict,
      ],
    });
  }

  private removeConflict(localProfileId: string) {
    this.setState({
      ...this.state,
      conflicts: this.state.conflicts.filter((conflict) => conflict.localProfileId !== localProfileId),
    });
  }

  private finishSync() {
    if (this.state.conflicts.length) {
      this.setState({ ...this.state, status: "conflict", error: undefined });
    } else {
      this.setState({
        status: "synced",
        conflicts: [],
        lastSyncedAt: new Date().toISOString(),
      });
    }
  }

  private failSync(error: unknown) {
    const message = error instanceof Error ? error.message : "We couldn't sync your worlds.";
    this.setState({
      ...this.state,
      status: isOfflineError(error) ? "offline" : "error",
      error: message,
    });
  }

  private setState(state: AccountSyncState) {
    this.state = state;
    this.onStateChange(state);
  }

  private enqueue(task: () => Promise<void>) {
    const result = this.queue.then(task);
    this.queue = result.catch((error: unknown) => this.failSync(error));
    return result;
  }

  private isCurrent(generation: number) {
    return this.active?.generation === generation;
  }
}

function bindingFor(profile: InventoryProfile, workspaceId: string) {
  return profile.cloudBindings?.find((binding) => binding.workspaceId === workspaceId);
}

function createId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `palpath-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isOfflineError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return error instanceof TypeError && /fetch|network|offline/i.test(error.message);
}

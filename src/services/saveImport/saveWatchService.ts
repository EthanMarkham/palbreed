import {
  CURRENT_INVENTORY_NORMALIZATION_VERSION,
  type InventoryProfile,
} from "../../domain/inventory";
import {
  SaveImportError,
  type LogicalSaveFile,
  type SavePlatform,
  type SaveSlotCandidate,
} from "../../domain/saveImport";
import { inventoryService } from "../inventory/inventoryService";
import {
  chooseSaveDirectory,
  fileSetSignature,
  getWorldDirectory,
  getXboxAccountDirectory,
  querySaveDirectoryPermission,
  readSaveDirectory,
  requestSaveDirectoryPermission,
  selectXboxAccountFiles,
  supportsPersistentSaveFolders,
} from "./fileSystemDirectory";
import { createImportedProfileInput } from "./importedProfile";
import { extractPalsFromSlot } from "./palSaveParser";
import { scanLogicalSaveSelection } from "./saveScanner";
import {
  IndexedDbSaveWatchStore,
  type SaveWatchStore,
  type StoredSaveWatch,
} from "./saveWatchStore";

const POLL_INTERVAL_MS = 15_000;
const SAVE_STABILITY_DELAY_MS = 1_500;
const LOCK_NAME = "palpath-save-watch-poll";
const CHANNEL_NAME = "palpath-save-watch";

export type SaveWatchWorldState = {
  profileId: string;
  status: "watching" | "checking" | "waiting" | "needs-permission" | "access-blocked" | "needs-folder" | "error";
  folderName: string;
  message: string;
  monitoringMode: "notifications+polling" | "polling";
  lastCheckedAt?: string;
  lastUpdatedAt?: string;
};

export type SaveWatchSnapshot = {
  supported: boolean;
  ready: boolean;
  worlds: Readonly<Record<string, SaveWatchWorldState>>;
};

export type SaveRefreshResult = "updated" | "unchanged";

type WatchMessage =
  | { type: "config-changed" }
  | { type: "profile-updated"; profileId: string }
  | { type: "state"; state: SaveWatchWorldState };

type Listener = () => void;

type SaveSourceSnapshot = {
  signature: string;
  files?: readonly LogicalSaveFile[];
};

type DirectoryObserver = {
  observe(
    handle: FileSystemDirectoryHandle,
    options?: { recursive?: boolean },
  ): Promise<void>;
  disconnect(): void;
};

type DirectoryObserverConstructor = new (
  callback: () => void,
) => DirectoryObserver;

export function watchAccessState(permission: PermissionState) {
  if (permission === "granted") {
    return {
        status: "watching" as const,
        message: "Watching while Palpath is open.",
      };
  }
  if (permission === "prompt") {
    return {
        status: "needs-permission" as const,
        message: "Browser access is paused. Resume access to the remembered folder.",
      };
  }
  return {
    status: "access-blocked" as const,
    message: "Browser access is blocked. Allow this site to read local files or choose another source.",
  };
}

export class SaveWatchService {
  private readonly listeners = new Set<Listener>();
  private readonly watches = new Map<string, StoredSaveWatch>();
  private readonly observers = new Map<string, DirectoryObserver>();
  private readonly transientFailures = new Map<string, number>();
  private snapshot: SaveWatchSnapshot = {
    supported: supportsPersistentSaveFolders(),
    ready: !supportsPersistentSaveFolders(),
    worlds: {},
  };
  private started = false;
  private runId = 0;
  private wakeVersion = 0;
  private wakePolling: (() => void) | undefined;
  private observerWakeTimer: number | undefined;
  private channel: BroadcastChannel | undefined;

  constructor(private readonly store: SaveWatchStore = new IndexedDbSaveWatchStore()) {}

  getSnapshot = () => this.snapshot;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start() {
    if (this.started || !this.snapshot.supported) return;
    this.started = true;
    this.runId += 1;
    if ("BroadcastChannel" in globalThis) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<WatchMessage>) => {
        void this.receiveMessage(event.data);
      };
    }
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    const runId = this.runId;
    void this.loadWatches()
      .catch((error) => {
        console.error("Saved folder connections could not be restored.", error);
        this.setSnapshot({ ...this.snapshot, ready: true });
      })
      .then(() => {
        if (this.started && this.runId === runId) void this.runPollingLoop(runId);
      });
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.runId += 1;
    this.wakePolling?.();
    if (this.observerWakeTimer !== undefined) window.clearTimeout(this.observerWakeTimer);
    this.observerWakeTimer = undefined;
    this.disconnectObservers();
    this.channel?.close();
    this.channel = undefined;
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  async enableAfterImport(
    profileId: string,
    directoryHandle: FileSystemDirectoryHandle,
    slot: SaveSlotCandidate,
    sourceAccountId?: string,
  ) {
    const profile = inventoryService.getProfile(profileId);
    if (!profile) throw new Error("Import this world before turning on automatic refresh.");
    if (profile.worldId !== slot.worldId) {
      throw new Error("That folder does not match the imported world.");
    }
    const scopedDirectory = profile.platform === "xbox"
      ? (await getXboxAccountDirectory(directoryHandle, sourceAccountId)).directoryHandle
      : await getWorldDirectory(directoryHandle, slot.rootPath);
    const sourceFiles = await readSaveDirectory(scopedDirectory);
    const scopedSlot = profile.platform === "steam"
      ? { ...slot, rootPath: scopedDirectory.name }
      : slot;
    await this.saveWatch(
      profile,
      scopedDirectory,
      scopedSlot,
      fileSetSignature(sourceFiles),
      sourceAccountId,
    );
  }

  async refresh(
    profileId: string,
    resumeAccess = false,
  ): Promise<SaveRefreshResult> {
    const profile = inventoryService.getProfile(profileId);
    if (!profile) throw new Error("That imported world is no longer available.");
    const watch = this.watches.get(profileId);
    if (!watch) {
      throw new Error("Choose this world's save folder before refreshing it.");
    }

    const permission = resumeAccess
      ? await requestSaveDirectoryPermission(watch.directoryHandle)
      : await querySaveDirectoryPermission(watch.directoryHandle);
    if (permission !== "granted") {
      const access = watchAccessState(permission);
      this.setWorldState(watch, {
        ...access,
      });
      throw new Error(
        permission === "denied"
          ? "Browser access is blocked. Allow local file access for Palpath or choose another source."
          : `Palpath still remembers ${watch.folderName}. Allow access to resume local auto-refresh.`,
      );
    }
    this.setWorldState(watch, {
      status: "checking",
      message: "Checking this world for changes…",
    });
    return this.withExclusiveLock(async () => {
      const currentWatch = this.watches.get(profileId);
      if (!currentWatch) throw new Error("Automatic refresh was disconnected.");
      const result = await this.pollWorld(currentWatch, profile, true);
      if (!result) throw new Error("Folder access changed before the refresh completed.");
      return result;
    });
  }

  async chooseFolder(profileId: string) {
    const profile = inventoryService.getProfile(profileId);
    if (!profile) throw new Error("That imported world is no longer available.");

    const existing = this.watches.get(profileId);
    const pickedDirectory = await chooseSaveDirectory(
      profile.platform,
      existing?.directoryHandle,
    );
    const directoryHandle = profile.platform === "xbox"
      ? (await getXboxAccountDirectory(pickedDirectory, existing?.sourceAccountId)).directoryHandle
      : pickedDirectory;
    const files = await readSaveDirectory(directoryHandle);
    const manifest = await scanLogicalSaveSelection(files, profile.platform);
    const slot = manifest.slots.find(({ worldId }) => worldId === profile.worldId);
    if (!slot) {
      throw new SaveImportError(
        "NO_WORLDS",
        `We couldn't find ${profile.name} in that folder. Choose the save folder that contains it.`,
      );
    }
    await this.enableAfterImport(
      profile.id,
      directoryHandle,
      slot,
      manifest.sourceAccountId,
    );
    await this.refresh(profileId);
  }

  async disable(profileId: string) {
    if (navigator.locks?.request) {
      await navigator.locks.request(LOCK_NAME, async () => {
        await this.deleteWatch(profileId);
      });
    } else {
      await this.deleteWatch(profileId);
    }
    this.broadcast({ type: "config-changed" });
  }

  private async deleteWatch(profileId: string) {
    const existing = this.watches.get(profileId);
    this.watches.delete(profileId);
    if (existing) this.disconnectUnusedObserver(this.sourceKey(existing));
    await this.store.delete(profileId);
    const worlds = { ...this.snapshot.worlds };
    delete worlds[profileId];
    this.setSnapshot({ ...this.snapshot, worlds });
  }

  checkNow() {
    this.wakeVersion += 1;
    this.wakePolling?.();
  }

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === "visible") this.checkNow();
  };

  private async saveWatch(
    profile: InventoryProfile,
    directoryHandle: FileSystemDirectoryHandle,
    slot: SaveSlotCandidate,
    lastSourceSignature: string | undefined,
    sourceAccountId?: string,
  ) {
    const now = new Date().toISOString();
    const existing = this.watches.get(profile.id);
    const watch: StoredSaveWatch = {
      version: 1,
      profileId: profile.id,
      worldId: profile.worldId ?? slot.worldId,
      platform: profile.platform,
      scope: profile.platform === "xbox" ? "xbox-account" : "steam-world",
      sourceAccountId,
      accountId: profile.accountId,
      folderName: directoryHandle.name,
      worldRootPath: slot.rootPath,
      directoryHandle,
      lastSourceSignature,
      enabledAt: existing?.enabledAt ?? now,
      lastCheckedAt: existing?.lastCheckedAt,
      lastUpdatedAt: existing?.lastUpdatedAt,
    };
    await this.withExclusiveLock(async () => {
      await this.store.put(watch);
      this.watches.set(watch.profileId, watch);
    });
    void navigator.storage?.persist?.().catch(() => false);
    if (existing && this.sourceKey(existing) !== this.sourceKey(watch)) {
      this.disconnectUnusedObserver(this.sourceKey(existing));
    }
    this.setWorldState(watch, {
      status: "watching",
      message: "Watching while Palpath is open.",
    });
    void this.observeWatch(watch);
    this.broadcast({ type: "config-changed" });
    this.checkNow();
  }

  private async loadWatches() {
    const stored = await this.store.list();
    this.disconnectObservers();
    this.watches.clear();
    const worlds: Record<string, SaveWatchWorldState> = {};
    for (const watch of stored) {
      if (watch.version !== 1) continue;
      this.watches.set(watch.profileId, watch);
      let permission: PermissionState;
      try {
        permission = await querySaveDirectoryPermission(watch.directoryHandle);
      } catch {
        permission = "denied";
      }
      worlds[watch.profileId] = {
        profileId: watch.profileId,
        folderName: watch.folderName,
        monitoringMode: monitoringMode(),
        ...watchAccessState(permission),
        lastCheckedAt: watch.lastCheckedAt,
        lastUpdatedAt: watch.lastUpdatedAt,
      };
    }
    this.setSnapshot({ ...this.snapshot, ready: true, worlds });
  }

  private async runPollingLoop(runId: number) {
    while (this.started && this.runId === runId) {
      const wakeVersion = this.wakeVersion;
      try {
        if (navigator.locks?.request) {
          await navigator.locks.request(
            LOCK_NAME,
            { ifAvailable: true },
            async (lock) => {
              if (lock) await this.pollAll();
            },
          );
        } else {
          await this.pollAll();
        }
      } catch (error) {
        if (this.started) console.error("Automatic save refresh failed.", error);
      }
      if (wakeVersion !== this.wakeVersion) continue;
      await this.waitForPoll(
        runId,
        this.watches.size ? POLL_INTERVAL_MS : undefined,
      );
    }
  }

  private async pollAll() {
    await inventoryService.whenReady();
    const sourceSnapshots = new Map<string, SaveSourceSnapshot>();
    for (const watch of [...this.watches.values()]) {
      if (!this.started) return;
      const profile = inventoryService.getProfile(watch.profileId);
      if (!profile) {
        await this.deleteWatch(watch.profileId);
        this.broadcast({ type: "config-changed" });
        continue;
      }
      await this.pollWorld(watch, profile, false, sourceSnapshots);
    }
  }

  private async pollWorld(
    watch: StoredSaveWatch,
    profile: InventoryProfile,
    throwOnError = false,
    sharedSourceSnapshots?: Map<string, SaveSourceSnapshot>,
  ): Promise<SaveRefreshResult | undefined> {
    try {
      const permission = await querySaveDirectoryPermission(watch.directoryHandle);
      if (permission !== "granted") {
        const access = watchAccessState(permission);
        this.setWorldState(watch, {
          ...access,
        });
        return undefined;
      }
      watch = await this.ensureScopedWatch(watch, profile);
      void this.observeWatch(watch);

      const sourceKey = this.sourceKey(watch);
      let firstSource = sharedSourceSnapshots?.get(sourceKey);
      if (!firstSource) {
        firstSource = await this.readSourceSnapshot(watch, profile);
        sharedSourceSnapshots?.set(sourceKey, firstSource);
      }
      const checkedAt = new Date().toISOString();
      if (
        watch.lastSourceSignature === firstSource.signature
        && profile.normalizationVersion >= CURRENT_INVENTORY_NORMALIZATION_VERSION
      ) {
        this.transientFailures.delete(watch.profileId);
        this.setWorldState(watch, {
          status: "watching",
          message: "Watching while Palpath is open.",
          lastCheckedAt: checkedAt,
        });
        return "unchanged";
      }

      this.setWorldState(watch, {
        status: "checking",
        message: "Checking this world for changes…",
      });
      await delay(SAVE_STABILITY_DELAY_MS);
      const stableSource = await this.readSourceSnapshot(watch, profile);
      if (stableSource.signature !== firstSource.signature) {
        throw new SaveStillChangingError();
      }
      sharedSourceSnapshots?.set(sourceKey, stableSource);

      const files = stableSource.files ?? await readSaveDirectory(
        await getWorldDirectory(watch.directoryHandle, watch.worldRootPath),
        watch.worldRootPath,
      );
      const manifest = await scanLogicalSaveSelection(files, profile.platform);
      const slot = manifest.slots.find(({ worldId }) => worldId === watch.worldId);
      if (!slot) throw new Error("We couldn't find the imported world in its saved folder.");

      const preview = await extractPalsFromSlot(slot);
      const input = createImportedProfileInput(manifest, slot, preview);
      const result = inventoryService.replaceImportedProfile(input, { activate: false });
      await inventoryService.flush();

      const updatedAt = new Date().toISOString();
      const nextWatch: StoredSaveWatch = {
        ...watch,
        lastSourceSignature: stableSource.signature,
        lastCheckedAt: updatedAt,
        lastUpdatedAt: result === "unchanged" ? watch.lastUpdatedAt : updatedAt,
      };
      this.watches.set(watch.profileId, nextWatch);
      await this.store.put(nextWatch);
      this.transientFailures.delete(watch.profileId);
      this.setWorldState(nextWatch, {
        status: "watching",
        message: result === "unchanged"
          ? "Save checked. Your imported Pals are already current."
          : `Updated from your ${profile.platform === "xbox" ? "Xbox" : "Steam"} save.`,
        lastCheckedAt: updatedAt,
        lastUpdatedAt: nextWatch.lastUpdatedAt,
      });
      if (result !== "unchanged") {
        this.broadcast({ type: "profile-updated", profileId: watch.profileId });
      }
      return result === "unchanged" ? "unchanged" : "updated";
    } catch (error) {
      const stillSaving = isTransientWatchError(error, profile.platform);
      const transientFailureCount = stillSaving
        ? (this.transientFailures.get(watch.profileId) ?? 0) + 1
        : 0;
      if (stillSaving) this.transientFailures.set(watch.profileId, transientFailureCount);
      else this.transientFailures.delete(watch.profileId);
      this.setWorldState(watch, {
        status: stillSaving
          ? transientFailureCount >= 4 ? "waiting" : "watching"
          : "error",
        message: stillSaving
          ? transientFailureCount >= 4
            ? "The local save has not settled yet. Your last good import is safe; Palpath is still retrying."
            : "Palworld or Xbox cloud sync is still saving. We'll try again shortly."
          : watchErrorMessage(error),
      });
      if (throwOnError) throw error;
      return undefined;
    }
  }

  private async readSourceSnapshot(
    watch: StoredSaveWatch,
    profile: InventoryProfile,
  ): Promise<SaveSourceSnapshot> {
    if (profile.platform === "steam") {
      const world = await getWorldDirectory(
        watch.directoryHandle,
        watch.worldRootPath,
      );
      const files = await readSaveDirectory(world, watch.worldRootPath);
      return { signature: fileSetSignature(files), files };
    }
    const files = selectXboxAccountFiles(
      await readSaveDirectory(watch.directoryHandle),
      watch.sourceAccountId,
    );
    return { signature: fileSetSignature(files), files };
  }

  private async ensureScopedWatch(
    watch: StoredSaveWatch,
    profile: InventoryProfile,
  ) {
    if (watch.platform && watch.scope) return watch;

    const legacySourceAccountId = profile.platform === "xbox"
      && profile.accountId
      && !profile.accountId.startsWith("palpath-source-v1:")
      ? profile.accountId
      : undefined;
    const scopedDirectory = profile.platform === "xbox"
      ? (await getXboxAccountDirectory(
          watch.directoryHandle,
          watch.sourceAccountId ?? legacySourceAccountId,
        )).directoryHandle
      : await getWorldDirectory(watch.directoryHandle, watch.worldRootPath);
    const migrated: StoredSaveWatch = {
      ...watch,
      platform: profile.platform,
      scope: profile.platform === "xbox" ? "xbox-account" : "steam-world",
      sourceAccountId: profile.platform === "xbox"
        ? scopedDirectory.name
        : undefined,
      directoryHandle: scopedDirectory,
      folderName: scopedDirectory.name,
      worldRootPath: profile.platform === "steam"
        ? scopedDirectory.name
        : watch.worldRootPath,
    };
    this.watches.set(migrated.profileId, migrated);
    await this.store.put(migrated);
    return migrated;
  }

  private async observeWatch(watch: StoredSaveWatch) {
    const Observer = (globalThis as typeof globalThis & {
      FileSystemObserver?: DirectoryObserverConstructor;
    }).FileSystemObserver;
    if (!Observer) return;

    const sourceKey = this.sourceKey(watch);
    if (this.observers.has(sourceKey)) return;
    const observer = new Observer(() => this.queueObserverReconciliation());
    try {
      await observer.observe(watch.directoryHandle, { recursive: true });
      if (
        !this.started
        || ![...this.watches.values()].some((candidate) => this.sourceKey(candidate) === sourceKey)
      ) {
        observer.disconnect();
        return;
      }
      this.observers.set(sourceKey, observer);
    } catch {
      // FileSystemObserver is non-standard. Polling remains the reliable path.
      observer.disconnect();
    }
  }

  private disconnectObservers() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
  }

  private queueObserverReconciliation() {
    if (this.observerWakeTimer !== undefined) window.clearTimeout(this.observerWakeTimer);
    this.observerWakeTimer = window.setTimeout(() => {
      this.observerWakeTimer = undefined;
      this.checkNow();
    }, 400);
  }

  private sourceKey(watch: StoredSaveWatch) {
    return watch.scope === "xbox-account" || watch.platform === "xbox"
      ? `xbox:${watch.sourceAccountId ?? watch.folderName}`
      : `steam:${watch.worldId}:${watch.folderName}`;
  }

  private disconnectUnusedObserver(sourceKey: string) {
    if ([...this.watches.values()].some((watch) => this.sourceKey(watch) === sourceKey)) return;
    this.observers.get(sourceKey)?.disconnect();
    this.observers.delete(sourceKey);
  }

  private setWorldState(
    watch: StoredSaveWatch,
    update: Omit<SaveWatchWorldState, "profileId" | "folderName" | "monitoringMode">,
  ) {
    const state: SaveWatchWorldState = {
      profileId: watch.profileId,
      folderName: watch.folderName,
      monitoringMode: monitoringMode(),
      lastCheckedAt: watch.lastCheckedAt,
      lastUpdatedAt: watch.lastUpdatedAt,
      ...update,
    };
    this.setSnapshot({
      ...this.snapshot,
      worlds: { ...this.snapshot.worlds, [watch.profileId]: state },
    });
    this.broadcast({ type: "state", state });
  }

  private setSnapshot(snapshot: SaveWatchSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  private broadcast(message: WatchMessage) {
    this.channel?.postMessage(message);
  }

  private async receiveMessage(message: WatchMessage) {
    if (message.type === "config-changed") {
      await this.loadWatches();
      this.checkNow();
      return;
    }
    if (message.type === "profile-updated") {
      await inventoryService.refreshFromStorage();
      return;
    }
    this.setSnapshot({
      ...this.snapshot,
      worlds: {
        ...this.snapshot.worlds,
        [message.state.profileId]: message.state,
      },
    });
  }

  private waitForPoll(runId: number, timeout: number | undefined) {
    return new Promise<void>((resolve) => {
      const finish = () => {
        if (timer !== undefined) window.clearTimeout(timer);
        if (this.runId === runId) this.wakePolling = undefined;
        resolve();
      };
      const timer = timeout === undefined
        ? undefined
        : window.setTimeout(finish, timeout);
      this.wakePolling = finish;
    });
  }

  private withExclusiveLock<T>(operation: () => Promise<T>) {
    return navigator.locks?.request
      ? navigator.locks.request(LOCK_NAME, operation)
      : operation();
  }
}

function monitoringMode(): SaveWatchWorldState["monitoringMode"] {
  return "FileSystemObserver" in globalThis ? "notifications+polling" : "polling";
}

class SaveStillChangingError extends Error {}

export function isTransientWatchError(error: unknown, platform: SavePlatform) {
  if (error instanceof SaveStillChangingError) return true;
  if (
    platform === "xbox"
    && error instanceof DOMException
    && error.name === "NotFoundError"
  ) {
    return true;
  }
  if (!(error instanceof SaveImportError)) return false;
  if (
    error.code === "CORRUPT_SAVE"
    || error.code === "INCOMPLETE_CLOUD_SYNC"
    || error.code === "NO_WORLDS"
  ) {
    return true;
  }
  return false;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function watchErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "We can't find the watched save. Reconnect this world's save folder.";
  }
  return error instanceof Error
    ? error.message
    : "We couldn't check this world. Reconnect its save folder.";
}

export const saveWatchService = new SaveWatchService();

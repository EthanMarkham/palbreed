import type { InventoryProfile } from "../../domain/inventory";
import { SaveImportError, type SaveSlotCandidate } from "../../domain/saveImport";
import { inventoryService } from "../inventory/inventoryService";
import {
  chooseSaveDirectory,
  fileSignature,
  getSteamWorldTrigger,
  getXboxSaveTrigger,
  getWorldDirectory,
  querySaveDirectoryPermission,
  readSaveDirectory,
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
  status: "watching" | "checking" | "needs-folder" | "error";
  folderName: string;
  message: string;
  lastCheckedAt?: string;
  lastUpdatedAt?: string;
};

export type SaveWatchSnapshot = {
  supported: boolean;
  worlds: Readonly<Record<string, SaveWatchWorldState>>;
};

type WatchMessage =
  | { type: "config-changed" }
  | { type: "profile-updated"; profileId: string }
  | { type: "state"; state: SaveWatchWorldState };

type Listener = () => void;

export class SaveWatchService {
  private readonly listeners = new Set<Listener>();
  private readonly watches = new Map<string, StoredSaveWatch>();
  private snapshot: SaveWatchSnapshot = {
    supported: supportsPersistentSaveFolders(),
    worlds: {},
  };
  private started = false;
  private runId = 0;
  private wakeVersion = 0;
  private wakePolling: (() => void) | undefined;
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
    void this.loadWatches().then(() => {
      if (this.started && this.runId === runId) void this.runPollingLoop(runId);
    });
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.runId += 1;
    this.wakePolling?.();
    this.channel?.close();
    this.channel = undefined;
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  async enableAfterImport(
    profileId: string,
    directoryHandle: FileSystemDirectoryHandle,
    slot: SaveSlotCandidate,
  ) {
    const profile = inventoryService.getProfile(profileId);
    if (!profile) throw new Error("Import this world before turning on automatic refresh.");
    if (profile.worldId !== slot.worldId) {
      throw new Error("That folder does not match the imported world.");
    }
    const trigger = profile.platform === "xbox"
      ? await (await getXboxSaveTrigger(directoryHandle)).getFile()
      : slot.files.get("level/01.sav")?.file;
    await this.saveWatch(profile, directoryHandle, slot, trigger ? fileSignature(trigger) : undefined);
  }

  async reconnect(profileId: string) {
    const profile = inventoryService.getProfile(profileId);
    if (!profile) throw new Error("That imported world is no longer available.");
    const directoryHandle = await chooseSaveDirectory();
    const files = await readSaveDirectory(directoryHandle);
    const manifest = await scanLogicalSaveSelection(files, profile.platform);
    const slot = manifest.slots.find(({ worldId }) => worldId === profile.worldId)
      ?? (manifest.slots.length === 1 ? manifest.slots[0] : undefined);
    if (!slot) {
      throw new SaveImportError(
        "NO_WORLDS",
        `We couldn't find ${profile.name} in that folder. Choose the save folder that contains it.`,
      );
    }
    await this.saveWatch(profile, directoryHandle, slot, undefined);
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
    this.watches.delete(profileId);
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
  ) {
    const now = new Date().toISOString();
    const existing = this.watches.get(profile.id);
    const watch: StoredSaveWatch = {
      version: 1,
      profileId: profile.id,
      worldId: profile.worldId ?? slot.worldId,
      accountId: profile.accountId,
      folderName: directoryHandle.name,
      worldRootPath: slot.rootPath,
      directoryHandle,
      lastSourceSignature,
      enabledAt: existing?.enabledAt ?? now,
      lastCheckedAt: existing?.lastCheckedAt,
      lastUpdatedAt: existing?.lastUpdatedAt,
    };
    await navigator.locks.request(LOCK_NAME, async () => {
      await this.store.put(watch);
      this.watches.set(watch.profileId, watch);
    });
    this.setWorldState(watch, {
      status: "watching",
      message: "Watching while Palpath is open.",
    });
    this.broadcast({ type: "config-changed" });
    this.checkNow();
  }

  private async loadWatches() {
    const stored = await this.store.list();
    this.watches.clear();
    const worlds: Record<string, SaveWatchWorldState> = {};
    for (const watch of stored) {
      if (watch.version !== 1) continue;
      this.watches.set(watch.profileId, watch);
      worlds[watch.profileId] = {
        profileId: watch.profileId,
        folderName: watch.folderName,
        status: "watching",
        message: "Watching while Palpath is open.",
        lastCheckedAt: watch.lastCheckedAt,
        lastUpdatedAt: watch.lastUpdatedAt,
      };
    }
    this.setSnapshot({ ...this.snapshot, worlds });
  }

  private async runPollingLoop(runId: number) {
    while (this.started && this.runId === runId) {
      const wakeVersion = this.wakeVersion;
      try {
        await navigator.locks.request(
          LOCK_NAME,
          { ifAvailable: true },
          async (lock) => {
            if (lock) await this.pollAll();
          },
        );
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
    for (const watch of [...this.watches.values()]) {
      if (!this.started) return;
      const profile = inventoryService.getProfile(watch.profileId);
      if (!profile) {
        await this.deleteWatch(watch.profileId);
        this.broadcast({ type: "config-changed" });
        continue;
      }
      await this.pollWorld(watch, profile);
    }
  }

  private async pollWorld(watch: StoredSaveWatch, profile: InventoryProfile) {
    try {
      const permission = await querySaveDirectoryPermission(watch.directoryHandle);
      if (permission !== "granted") {
        this.setWorldState(watch, {
          status: "needs-folder",
          message: "Reconnect the save folder to resume.",
        });
        return;
      }

      const triggerHandle = profile.platform === "xbox"
        ? await getXboxSaveTrigger(watch.directoryHandle)
        : await getSteamWorldTrigger(watch.directoryHandle, watch.worldRootPath);
      const firstTrigger = await triggerHandle.getFile();
      const firstSignature = fileSignature(firstTrigger);
      const checkedAt = new Date().toISOString();
      if (watch.lastSourceSignature === firstSignature) {
        this.setWorldState(watch, {
          status: "watching",
          message: "Watching while Palpath is open.",
          lastCheckedAt: checkedAt,
        });
        return;
      }

      this.setWorldState(watch, {
        status: "checking",
        message: "Checking this world for changes…",
      });
      await delay(SAVE_STABILITY_DELAY_MS);
      const stableTrigger = await triggerHandle.getFile();
      const stableSignature = fileSignature(stableTrigger);
      if (stableSignature !== firstSignature) {
        throw new SaveStillChangingError();
      }

      const files = profile.platform === "xbox"
        ? await readSaveDirectory(watch.directoryHandle)
        : await readSaveDirectory(
            await getWorldDirectory(watch.directoryHandle, watch.worldRootPath),
            watch.worldRootPath,
          );
      const manifest = await scanLogicalSaveSelection(files, profile.platform);
      const slot = manifest.slots.find(({ worldId }) => worldId === watch.worldId)
        ?? (manifest.slots.length === 1 ? manifest.slots[0] : undefined);
      if (!slot) throw new Error("We couldn't find the imported world in its saved folder.");

      const preview = await extractPalsFromSlot(slot);
      const input = createImportedProfileInput(manifest, slot, preview);
      const result = inventoryService.replaceImportedProfile(input, { activate: false });
      await inventoryService.flush();

      const updatedAt = new Date().toISOString();
      const nextWatch: StoredSaveWatch = {
        ...watch,
        lastSourceSignature: stableSignature,
        lastCheckedAt: updatedAt,
        lastUpdatedAt: result === "unchanged" ? watch.lastUpdatedAt : updatedAt,
      };
      this.watches.set(watch.profileId, nextWatch);
      await this.store.put(nextWatch);
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
    } catch (error) {
      const stillSaving = error instanceof SaveStillChangingError
        || error instanceof SaveImportError && error.code === "CORRUPT_SAVE";
      this.setWorldState(watch, {
        status: stillSaving ? "watching" : "error",
        message: stillSaving
          ? "Palworld is still saving. We'll try again shortly."
          : watchErrorMessage(error),
      });
    }
  }

  private setWorldState(
    watch: StoredSaveWatch,
    update: Omit<SaveWatchWorldState, "profileId" | "folderName">,
  ) {
    const state: SaveWatchWorldState = {
      profileId: watch.profileId,
      folderName: watch.folderName,
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
}

class SaveStillChangingError extends Error {}

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

import type {
  InventoryDocument,
  InventoryPlatform,
  InventoryProfile,
  InventorySnapshot,
  OwnedPal,
} from "../../domain/inventory";
import type { InventoryGateway } from "./inventoryGateway";
import { IndexedDbInventoryGateway } from "./indexedDbInventoryGateway";

type Listener = () => void;

const OWNER_KEY = "palpath-anonymous-owner";

export class InventoryService {
  private readonly listeners = new Set<Listener>();
  private snapshot: InventorySnapshot;
  private started = false;
  private saveQueue = Promise.resolve();

  constructor(
    private readonly gateway: InventoryGateway,
    private readonly ownerId: string,
  ) {
    this.snapshot = {
      status: "loading",
      document: createInitialDocument(ownerId),
    };
  }

  getSnapshot = (): InventorySnapshot => this.snapshot;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start() {
    if (this.started) return;
    this.started = true;
    void this.load();
  }

  getActiveProfile(): InventoryProfile {
    const profile = this.snapshot.document.profiles.find(
      ({ id }) => id === this.snapshot.document.activeProfileId,
    );
    return profile ?? this.snapshot.document.profiles[0];
  }

  selectProfile(profileId: string) {
    if (!this.snapshot.document.profiles.some(({ id }) => id === profileId)) return;
    this.commit({ ...this.snapshot.document, activeProfileId: profileId });
  }

  createProfile(name: string, platform: InventoryPlatform = "manual") {
    const profile = createProfile(this.ownerId, name.trim() || "My Pals", platform);
    this.commit({
      ...this.snapshot.document,
      activeProfileId: profile.id,
      profiles: [...this.snapshot.document.profiles, profile],
    });
  }

  upsertPal(pal: OwnedPal) {
    this.updateActiveProfile((profile) => ({
      ...profile,
      pals: [...profile.pals.filter(({ id }) => id !== pal.id), pal],
    }));
  }

  removePal(palId: string) {
    this.updateActiveProfile((profile) => ({
      ...profile,
      pals: profile.pals.filter(({ id }) => id !== palId),
    }));
  }

  setPalIncluded(palId: string, included: boolean) {
    this.updateActiveProfile((profile) => ({
      ...profile,
      pals: profile.pals.map((pal) => pal.id === palId ? { ...pal, included } : pal),
    }));
  }

  replaceImportedProfile(input: {
    name: string;
    platform: InventoryPlatform;
    worldId: string;
    slotId: string;
    pals: readonly OwnedPal[];
  }) {
    const existing = this.snapshot.document.profiles.find(
      (profile) => profile.platform === input.platform && profile.slotId === input.slotId,
    );
    const now = new Date().toISOString();
    const existingSavePals = new Map<string, OwnedPal>();
    for (const pal of existing?.pals ?? []) {
      if (pal.source === "save" && pal.sourceInstanceId) {
        existingSavePals.set(pal.sourceInstanceId.toLowerCase(), pal);
      }
    }
    const importedPals = input.pals.map((pal) => {
      const previous = pal.sourceInstanceId
        ? existingSavePals.get(pal.sourceInstanceId.toLowerCase())
        : undefined;
      return previous ? { ...pal, included: previous.included } : pal;
    });
    const locallyAddedPals = (existing?.pals ?? []).filter(({ source }) => source !== "save");
    const profile: InventoryProfile = {
      ...(existing ?? createProfile(this.ownerId, input.name, input.platform)),
      name: input.name,
      platform: input.platform,
      worldId: input.worldId,
      slotId: input.slotId,
      importedAt: now,
      updatedAt: now,
      revision: (existing?.revision ?? 0) + 1,
      pals: [...importedPals, ...locallyAddedPals],
    };
    this.commit({
      ...this.snapshot.document,
      activeProfileId: profile.id,
      profiles: [...this.snapshot.document.profiles.filter(({ id }) => id !== profile.id), profile],
    });
  }

  private async load() {
    try {
      const stored = await this.gateway.load(this.ownerId);
      this.snapshot = {
        status: "ready",
        document: stored ?? this.snapshot.document,
      };
    } catch (error) {
      this.snapshot = {
        ...this.snapshot,
        status: "error",
        error: error instanceof Error ? error.message : "Inventory storage could not be loaded.",
      };
    }
    this.emit();
  }

  private updateActiveProfile(update: (profile: InventoryProfile) => InventoryProfile) {
    const active = this.getActiveProfile();
    const now = new Date().toISOString();
    const next = update(active);
    const versioned = { ...next, updatedAt: now, revision: active.revision + 1 };
    this.commit({
      ...this.snapshot.document,
      profiles: this.snapshot.document.profiles.map((profile) =>
        profile.id === active.id ? versioned : profile,
      ),
    });
  }

  private commit(document: InventoryDocument) {
    this.snapshot = { status: "ready", document };
    this.emit();
    this.saveQueue = this.saveQueue
      .then(() => this.gateway.save(this.ownerId, document))
      .catch((error: unknown) => {
        this.snapshot = {
          ...this.snapshot,
          status: "error",
          error: error instanceof Error ? error.message : "Inventory changes could not be saved.",
        };
        this.emit();
      });
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}

function createInitialDocument(ownerId: string): InventoryDocument {
  const profile = createProfile(ownerId, "My Pals", "manual");
  return { schemaVersion: 1, activeProfileId: profile.id, profiles: [profile] };
}

function createProfile(ownerId: string, name: string, platform: InventoryPlatform): InventoryProfile {
  const now = new Date().toISOString();
  return {
    id: createId(),
    owner: { kind: "anonymous", id: ownerId },
    name,
    gameVersion: "1.0",
    platform,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    pals: [],
  };
}

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `palpath-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getOwnerId(): string {
  try {
    const existing = localStorage.getItem(OWNER_KEY);
    if (existing) return existing;
    const ownerId = createId();
    localStorage.setItem(OWNER_KEY, ownerId);
    return ownerId;
  } catch {
    return "anonymous-session";
  }
}

export const inventoryService = new InventoryService(
  new IndexedDbInventoryGateway(),
  getOwnerId(),
);

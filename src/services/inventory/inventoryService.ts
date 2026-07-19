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
      document: createInitialDocument(),
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

  getActiveProfile(): InventoryProfile | undefined {
    return this.snapshot.document.profiles.find(
      ({ id }) => id === this.snapshot.document.activeProfileId,
    ) ?? this.snapshot.document.profiles[0];
  }

  selectProfile(profileId: string) {
    if (!this.snapshot.document.profiles.some(({ id }) => id === profileId)) return;
    this.commit({ ...this.snapshot.document, activeProfileId: profileId });
  }

  removeProfile(profileId: string) {
    const profiles = this.snapshot.document.profiles.filter(({ id }) => id !== profileId);
    if (profiles.length === this.snapshot.document.profiles.length) return;
    const activeProfileId = this.snapshot.document.activeProfileId === profileId
      ? profiles[0]?.id
      : this.snapshot.document.activeProfileId;
    this.commit({ ...this.snapshot.document, activeProfileId, profiles });
  }

  replaceImportedProfile(input: {
    name: string;
    platform: InventoryPlatform;
    worldId: string;
    slotId: string;
    accountId?: string;
    playerId?: string;
    playerName?: string;
    playerLevel?: number;
    pals: readonly OwnedPal[];
  }) {
    const matches = this.snapshot.document.profiles.filter((profile) => isSameWorld(profile, input));
    const existing = matches[0];
    const now = new Date().toISOString();
    const profile: InventoryProfile = {
      ...(existing ?? createImportedProfile(this.ownerId, input.name, input.platform)),
      name: input.name,
      platform: input.platform,
      worldId: input.worldId,
      slotId: input.slotId,
      accountId: input.accountId,
      playerId: input.playerId,
      playerName: input.playerName,
      playerLevel: input.playerLevel,
      importedAt: now,
      updatedAt: now,
      revision: (existing?.revision ?? 0) + 1,
      pals: input.pals,
    };
    const duplicateIds = new Set(matches.map(({ id }) => id));
    this.commit({
      ...this.snapshot.document,
      activeProfileId: profile.id,
      profiles: [
        ...this.snapshot.document.profiles.filter(({ id }) => !duplicateIds.has(id)),
        profile,
      ],
    });
    return existing ? "updated" as const : "created" as const;
  }

  private async load() {
    try {
      const stored = await this.gateway.load(this.ownerId);
      this.snapshot = {
        status: "ready",
        document: stored ? sanitizeDocument(stored) : this.snapshot.document,
      };
    } catch (error) {
      this.snapshot = {
        ...this.snapshot,
        status: "error",
        error: error instanceof Error ? error.message : "We couldn't open your saved worlds.",
      };
    }
    this.emit();
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
          error: error instanceof Error ? error.message : "We couldn't save your latest changes.",
        };
        this.emit();
      });
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}

function isSameWorld(
  profile: InventoryProfile,
  input: Pick<InventoryProfile, "platform" | "worldId" | "slotId" | "accountId">,
) {
  if (profile.platform !== input.platform) return false;
  const accountMatches = !profile.accountId || !input.accountId || profile.accountId === input.accountId;
  if (profile.worldId && input.worldId && profile.worldId === input.worldId) {
    return !/^world-\d+$/i.test(input.worldId) || accountMatches;
  }
  return Boolean(profile.slotId && profile.slotId === input.slotId && accountMatches);
}

function sanitizeDocument(document: InventoryDocument): InventoryDocument {
  const profiles = document.profiles
    .filter(({ platform }) => platform === "xbox" || platform === "steam")
    .map((profile) => ({
      ...profile,
      pals: profile.pals.flatMap((pal) => {
        const imported = sanitizeImportedPal(pal);
        return imported ? [imported] : [];
      }),
    }));
  const activeProfileId = profiles.some(({ id }) => id === document.activeProfileId)
    ? document.activeProfileId
    : profiles[0]?.id;
  return { ...document, activeProfileId, profiles };
}

function sanitizeImportedPal(pal: OwnedPal): OwnedPal | undefined {
  const legacySource = (pal as OwnedPal & { source?: string }).source;
  if (!pal.sourceInstanceId || (legacySource && legacySource !== "save")) return undefined;
  return {
    id: pal.id,
    sourceInstanceId: pal.sourceInstanceId,
    speciesId: pal.speciesId,
    gender: pal.gender,
    passiveIds: pal.passiveIds,
    location: pal.location,
    worldId: pal.worldId,
    playerId: pal.playerId,
    nickname: pal.nickname,
    level: pal.level,
  };
}

function createInitialDocument(): InventoryDocument {
  return { schemaVersion: 1, profiles: [] };
}

function createImportedProfile(
  ownerId: string,
  name: string,
  platform: InventoryPlatform,
): InventoryProfile {
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

function createId(): string {
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

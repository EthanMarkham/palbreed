import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import { runtimeConfig } from "../../config/runtimeConfig";
import type { PalId } from "../../domain/pal";
import type { PassiveId } from "../../domain/passive";
import type { BuilderObjective } from "../../services/builder/palBuilder";
import {
  getBuilderExtras,
  getBuilderObjective,
  getBuilderPassiveGoal,
  type BuilderSearchState,
} from "./builderSearch";

export const BUILDER_HISTORY_LIMIT = 8;

export type BuilderHistoryEntry = Readonly<{
  targetId: PalId;
  passives: "any" | readonly PassiveId[];
  objective: BuilderObjective;
  allowedExtras: 0 | 1 | 2;
  searchedAt: string;
}>;

export type BuilderHistoryBackend = {
  isAuthenticated(): Promise<boolean>;
  subscribeToAuth(listener: (authenticated: boolean) => void): () => void;
  list(anonymousSessionToken?: string): Promise<readonly BuilderHistoryEntry[]>;
  record(entry: BuilderHistoryEntry, anonymousSessionToken?: string): Promise<void>;
  remove(entry: BuilderHistoryEntry, anonymousSessionToken?: string): Promise<void>;
  clear(anonymousSessionToken?: string): Promise<void>;
  claim(anonymousSessionToken: string): Promise<number>;
};

export type BuilderHistorySessionStore = {
  read(): string | undefined;
  getOrCreate(): string;
  clear(): void;
};

type Listener = () => void;
type BackendLoader = () => Promise<BuilderHistoryBackend | undefined>;

export class BuilderHistoryService {
  private readonly listeners = new Set<Listener>();
  private entries: readonly BuilderHistoryEntry[] = [];
  private backend: BuilderHistoryBackend | undefined;
  private authenticated = false;
  private started = false;
  private ready: Promise<void> = Promise.resolve();
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly loadBackend: BackendLoader = loadSupabaseBackend,
    private readonly sessionStore: BuilderHistorySessionStore = browserSessionStore,
  ) {}

  getSnapshot = (): readonly BuilderHistoryEntry[] => this.entries;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start() {
    if (this.started) return;
    this.started = true;
    this.ready = this.initialize();
  }

  record(search: BuilderSearchState, searchedAt = new Date().toISOString()) {
    const entry = createBuilderHistoryEntry(search, searchedAt);
    if (!entry) return;
    this.update(mergeBuilderHistory(this.entries, entry));
    this.enqueue((backend, token) => backend.record(entry, token));
  }

  remove(entry: BuilderHistoryEntry) {
    const key = getBuilderHistoryKey(entry);
    this.update(this.entries.filter((candidate) => getBuilderHistoryKey(candidate) !== key));
    this.enqueue((backend, token) => backend.remove(entry, token));
  }

  clear() {
    if (!this.entries.length) return;
    this.update([]);
    this.enqueue((backend, token) => backend.clear(token));
  }

  reload() {
    this.start();
    this.enqueue(() => Promise.resolve());
  }

  async whenIdle() {
    this.start();
    await this.ready;
    await this.operationQueue;
  }

  private async initialize() {
    try {
      this.backend = await this.loadBackend();
      if (!this.backend) return;
      this.backend.subscribeToAuth((authenticated) => {
        this.operationQueue = this.operationQueue
          .then(() => this.switchIdentity(authenticated))
          .catch(() => undefined);
      });
      await this.switchIdentity(await this.backend.isAuthenticated());
    } catch {
      // The builder remains usable and keeps optimistic history for this page session.
    }
  }

  private async switchIdentity(authenticated: boolean) {
    const backend = this.backend;
    if (!backend) return;
    this.authenticated = authenticated;
    if (authenticated) {
      const anonymousSessionToken = this.sessionStore.read();
      if (anonymousSessionToken) {
        try {
          await backend.claim(anonymousSessionToken);
          this.sessionStore.clear();
        } catch {
          // Keep the bearer token so a later authenticated refresh can retry the claim.
        }
      }
    } else {
      this.sessionStore.getOrCreate();
    }
    await this.refresh();
  }

  private enqueue(
    operation: (backend: BuilderHistoryBackend, token: string | undefined) => Promise<void>,
  ) {
    this.start();
    this.operationQueue = this.operationQueue
      .then(async () => {
        await this.ready;
        const backend = this.backend;
        if (!backend) return;
        const token = this.authenticated ? undefined : this.sessionStore.getOrCreate();
        await operation(backend, token);
        await this.refresh();
      })
      .catch(() => undefined);
  }

  private async refresh() {
    const backend = this.backend;
    if (!backend) return;
    const token = this.authenticated ? undefined : this.sessionStore.getOrCreate();
    this.update(normalizeBuilderHistory(await backend.list(token)));
  }

  private update(entries: readonly BuilderHistoryEntry[]) {
    this.entries = entries;
    this.listeners.forEach((listener) => listener());
  }
}

export function createBuilderHistoryEntry(
  search: BuilderSearchState,
  searchedAt = new Date().toISOString(),
): BuilderHistoryEntry | undefined {
  const targetId = search.target;
  const passiveGoal = getBuilderPassiveGoal(search);
  if (!targetId || !breedingRepository.getPal(targetId) || !passiveGoal) return undefined;

  const normalizedDate = normalizeDate(searchedAt);
  if (!normalizedDate) return undefined;

  const passives = passiveGoal.kind === "any"
    ? "any" as const
    : [...passiveGoal.requiredIds].sort((left, right) => left.localeCompare(right));

  return {
    targetId,
    passives,
    objective: getBuilderObjective(search),
    allowedExtras: passiveGoal.kind === "any" ? 0 : getBuilderExtras(search),
    searchedAt: normalizedDate,
  };
}

export function builderHistoryEntryToSearch(entry: BuilderHistoryEntry): BuilderSearchState {
  const extras = entry.allowedExtras === 1 || entry.allowedExtras === 2
    ? entry.allowedExtras
    : undefined;
  return {
    target: entry.targetId,
    passives: entry.passives === "any" ? "any" : entry.passives.join(","),
    objective: entry.objective === "recommended" ? undefined : entry.objective,
    extras: entry.passives === "any" ? undefined : extras,
    run: true,
  };
}

export function mergeBuilderHistory(
  entries: readonly BuilderHistoryEntry[],
  next: BuilderHistoryEntry,
): readonly BuilderHistoryEntry[] {
  const nextKey = getBuilderHistoryKey(next);
  return [
    next,
    ...entries.filter((entry) => getBuilderHistoryKey(entry) !== nextKey),
  ].slice(0, BUILDER_HISTORY_LIMIT);
}

export function getBuilderHistoryKey(entry: BuilderHistoryEntry): string {
  const passives = entry.passives === "any" ? "any" : [...entry.passives].sort().join(",");
  return [entry.targetId, passives].join("|");
}

export function normalizeBuilderHistory(
  entries: readonly BuilderHistoryEntry[],
): readonly BuilderHistoryEntry[] {
  const normalized: BuilderHistoryEntry[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const targetId = entry.targetId;
    if (!breedingRepository.getPal(targetId)) continue;

    const passives = normalizePassives(entry.passives);
    const searchedAt = normalizeDate(entry.searchedAt);
    if (!passives || !searchedAt) continue;

    const candidate: BuilderHistoryEntry = {
      targetId,
      passives,
      objective: entry.objective,
      allowedExtras: passives === "any" ? 0 : entry.allowedExtras,
      searchedAt,
    };
    const key = getBuilderHistoryKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(candidate);
    if (normalized.length === BUILDER_HISTORY_LIMIT) break;
  }

  return normalized;
}

function normalizePassives(value: "any" | readonly string[]): "any" | readonly PassiveId[] | undefined {
  if (value === "any") return value;
  const passives = [...new Set(value)]
    .filter((id): id is PassiveId => Boolean(passiveRepository.get(id)))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 4);
  return passives.length ? passives : undefined;
}

function normalizeDate(value: string): string | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

async function loadSupabaseBackend(): Promise<BuilderHistoryBackend | undefined> {
  if (!runtimeConfig.supabase) return undefined;
  const [{ supabaseClient }, { SupabaseBuilderHistoryBackend }] = await Promise.all([
    import("../../services/supabase/supabaseClient"),
    import("./supabaseBuilderHistoryBackend"),
  ]);
  return supabaseClient ? new SupabaseBuilderHistoryBackend(supabaseClient) : undefined;
}

const ANONYMOUS_SESSION_COOKIE = "palpath_builder_session";
const ANONYMOUS_SESSION_PATTERN = /^[0-9a-f]{64}$/;

const browserSessionStore: BuilderHistorySessionStore = {
  read() {
    if (typeof document === "undefined") return undefined;
    const token = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${ANONYMOUS_SESSION_COOKIE}=`))
      ?.slice(ANONYMOUS_SESSION_COOKIE.length + 1);
    return token && ANONYMOUS_SESSION_PATTERN.test(token) ? token : undefined;
  },
  getOrCreate() {
    const existing = this.read();
    if (existing) return existing;
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    if (typeof document !== "undefined") {
      const secure = globalThis.location?.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${ANONYMOUS_SESSION_COOKIE}=${token}; Path=/; SameSite=Lax${secure}`;
    }
    return token;
  },
  clear() {
    if (typeof document === "undefined") return;
    const secure = globalThis.location?.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${ANONYMOUS_SESSION_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
  },
};

export const builderHistoryService = new BuilderHistoryService();

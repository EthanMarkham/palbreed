import { describe, expect, it } from "vitest";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import {
  BUILDER_HISTORY_LIMIT,
  BuilderHistoryService,
  builderHistoryEntryToSearch,
  createBuilderHistoryEntry,
  getBuilderHistoryKey,
  mergeBuilderHistory,
  type BuilderHistoryBackend,
  type BuilderHistoryEntry,
  type BuilderHistorySessionStore,
} from "./builderHistory";

const SESSION_TOKEN = "a".repeat(64);

class MemorySessionStore implements BuilderHistorySessionStore {
  token: string | undefined = SESSION_TOKEN;

  read() {
    return this.token;
  }

  getOrCreate() {
    this.token ??= SESSION_TOKEN;
    return this.token;
  }

  clear() {
    this.token = undefined;
  }
}

class MemoryBackend implements BuilderHistoryBackend {
  authenticated = false;
  accountEntries: readonly BuilderHistoryEntry[] = [];
  anonymousEntries = new Map<string, readonly BuilderHistoryEntry[]>();
  private readonly listeners = new Set<(authenticated: boolean) => void>();

  isAuthenticated() {
    return Promise.resolve(this.authenticated);
  }

  subscribeToAuth(listener: (authenticated: boolean) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(token?: string) {
    return Promise.resolve(this.authenticated ? this.accountEntries : this.anonymousEntries.get(token ?? "") ?? []);
  }

  record(entry: BuilderHistoryEntry, token?: string) {
    if (this.authenticated) this.accountEntries = mergeBuilderHistory(this.accountEntries, entry);
    else this.anonymousEntries.set(token ?? "", mergeBuilderHistory(this.anonymousEntries.get(token ?? "") ?? [], entry));
    return Promise.resolve();
  }

  remove(entry: BuilderHistoryEntry, token?: string) {
    const key = getBuilderHistoryKey(entry);
    if (this.authenticated) {
      this.accountEntries = this.accountEntries.filter((candidate) => getBuilderHistoryKey(candidate) !== key);
    } else {
      const entries = this.anonymousEntries.get(token ?? "") ?? [];
      this.anonymousEntries.set(token ?? "", entries.filter((candidate) => getBuilderHistoryKey(candidate) !== key));
    }
    return Promise.resolve();
  }

  clear(token?: string) {
    if (this.authenticated) this.accountEntries = [];
    else this.anonymousEntries.set(token ?? "", []);
    return Promise.resolve();
  }

  claim(token: string) {
    const entries = this.anonymousEntries.get(token) ?? [];
    for (const entry of [...entries].reverse()) {
      this.accountEntries = mergeBuilderHistory(this.accountEntries, entry);
    }
    this.anonymousEntries.delete(token);
    return Promise.resolve(entries.length);
  }

  setAuthenticated(authenticated: boolean) {
    this.authenticated = authenticated;
    this.listeners.forEach((listener) => listener(authenticated));
  }
}

function createService(backend = new MemoryBackend(), sessions = new MemorySessionStore()) {
  return {
    backend,
    sessions,
    service: new BuilderHistoryService(() => Promise.resolve(backend), sessions),
  };
}

describe("Builder search history", () => {
  it("deduplicates setting variants and restores the most recently used settings", async () => {
    const { service } = createService();
    const target = breedingRepository.allPals()[0].id;
    const [firstPassive, secondPassive] = passiveRepository.all().slice(0, 2).map(({ id }) => id);

    service.record({
      target,
      passives: `${secondPassive},${firstPassive}`,
      objective: "fewest",
      extras: 1,
    }, "2026-01-02T03:04:05.000Z");
    service.record({
      target,
      passives: `${firstPassive},${secondPassive}`,
      objective: "cleanest",
      extras: 2,
    }, "2026-02-03T04:05:06.000Z");
    await service.whenIdle();

    expect(service.getSnapshot()).toHaveLength(1);
    expect(service.getSnapshot()[0]).toMatchObject({
      targetId: target,
      passives: [firstPassive, secondPassive].sort(),
      objective: "cleanest",
      allowedExtras: 2,
      searchedAt: "2026-02-03T04:05:06.000Z",
    });
    expect(builderHistoryEntryToSearch(service.getSnapshot()[0])).toEqual({
      target,
      passives: [firstPassive, secondPassive].sort().join(","),
      objective: "cleanest",
      extras: 2,
      run: true,
    });
  });

  it("keeps only the most recent eight canonical searches", async () => {
    const { service } = createService();
    const targets = breedingRepository.allPals().slice(0, BUILDER_HISTORY_LIMIT + 2);

    targets.forEach(({ id }, index) => {
      service.record({ target: id, passives: "any" }, new Date(Date.UTC(2026, 0, index + 1)).toISOString());
    });
    await service.whenIdle();

    expect(service.getSnapshot()).toHaveLength(BUILDER_HISTORY_LIMIT);
    expect(service.getSnapshot()[0].targetId).toBe(targets[targets.length - 1].id);
    expect(service.getSnapshot()[BUILDER_HISTORY_LIMIT - 1].targetId).toBe(targets[2].id);
  });

  it("claims anonymous session history after authentication", async () => {
    const { backend, service, sessions } = createService();
    const target = breedingRepository.allPals()[0].id;

    service.record({ target, passives: "any" }, "2026-01-02T03:04:05.000Z");
    await service.whenIdle();
    expect(backend.anonymousEntries.get(SESSION_TOKEN)).toHaveLength(1);

    backend.setAuthenticated(true);
    await service.whenIdle();

    expect(sessions.read()).toBeUndefined();
    expect(backend.anonymousEntries.has(SESSION_TOKEN)).toBe(false);
    expect(backend.accountEntries).toHaveLength(1);
    expect(service.getSnapshot()[0].targetId).toBe(target);
  });

  it("ignores invalid searches and remains usable without a configured backend", async () => {
    const service = new BuilderHistoryService(() => Promise.resolve(undefined), new MemorySessionStore());

    expect(createBuilderHistoryEntry({ target: "not-a-pal", passives: "any" })).toBeUndefined();
    service.record({ target: breedingRepository.allPals()[0].id, passives: "any" });
    await service.whenIdle();

    expect(service.getSnapshot()).toHaveLength(1);
  });
});

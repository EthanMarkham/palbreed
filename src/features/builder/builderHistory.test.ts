import { describe, expect, it } from "vitest";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import {
  BUILDER_HISTORY_LIMIT,
  BUILDER_HISTORY_STORAGE_KEY,
  BuilderHistoryService,
  builderHistoryEntryToSearch,
  createBuilderHistoryEntry,
} from "./builderHistory";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("Builder search history", () => {
  it("canonicalizes equivalent searches and restores their route state", () => {
    const storage = new MemoryStorage();
    const service = new BuilderHistoryService(() => storage);
    const target = breedingRepository.allPals()[0].id;
    const [firstPassive, secondPassive] = passiveRepository.all().slice(0, 2).map(({ id }) => id);

    service.record({
      target,
      passives: `${secondPassive},${firstPassive}`,
      objective: "cleanest",
      extras: 1,
    }, "2026-01-02T03:04:05.000Z");
    service.record({
      target,
      passives: `${firstPassive},${secondPassive}`,
      objective: "cleanest",
      extras: 1,
    }, "2026-02-03T04:05:06.000Z");

    expect(service.getSnapshot()).toHaveLength(1);
    expect(service.getSnapshot()[0]).toMatchObject({
      targetId: target,
      passives: [firstPassive, secondPassive].sort(),
      objective: "cleanest",
      allowedExtras: 1,
      searchedAt: "2026-02-03T04:05:06.000Z",
    });
    expect(builderHistoryEntryToSearch(service.getSnapshot()[0])).toEqual({
      target,
      passives: [firstPassive, secondPassive].sort().join(","),
      objective: "cleanest",
      extras: 1,
      run: true,
    });
  });

  it("keeps only the most recent unique searches", () => {
    const storage = new MemoryStorage();
    const service = new BuilderHistoryService(() => storage);
    const targets = breedingRepository.allPals().slice(0, BUILDER_HISTORY_LIMIT + 2);

    targets.forEach(({ id }, index) => {
      service.record({ target: id, passives: "any" }, new Date(Date.UTC(2026, 0, index + 1)).toISOString());
    });

    expect(service.getSnapshot()).toHaveLength(BUILDER_HISTORY_LIMIT);
    expect(service.getSnapshot()[0].targetId).toBe(targets[targets.length - 1].id);
    expect(service.getSnapshot()[BUILDER_HISTORY_LIMIT - 1].targetId).toBe(targets[2].id);
  });

  it("ignores invalid persisted data and keeps unavailable storage session-safe", () => {
    const storage = new MemoryStorage();
    storage.setItem(BUILDER_HISTORY_STORAGE_KEY, "not-json");
    const service = new BuilderHistoryService(() => storage);

    expect(service.getSnapshot()).toEqual([]);
    expect(createBuilderHistoryEntry({ target: "not-a-pal", passives: "any" })).toBeUndefined();

    const volatileService = new BuilderHistoryService(() => ({
      getItem: () => null,
      setItem: () => {
        throw new Error("Storage blocked");
      },
    }));
    volatileService.record({ target: breedingRepository.allPals()[0].id, passives: "any" });
    expect(volatileService.getSnapshot()).toHaveLength(1);
  });
});

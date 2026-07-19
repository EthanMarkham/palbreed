import { z } from "zod";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import type { PalId } from "../../domain/pal";
import type { PassiveId } from "../../domain/passive";
import type { BuilderObjective } from "../../services/builder/palBuilder";
import {
  getBuilderExtras,
  getBuilderObjective,
  getBuilderPassiveGoal,
  type BuilderSearchState,
} from "./builderSearch";

export const BUILDER_HISTORY_STORAGE_KEY = "palpath:builder-history";
export const BUILDER_HISTORY_LIMIT = 8;

const storedEntrySchema = z.object({
  targetId: z.string(),
  passives: z.union([z.literal("any"), z.array(z.string())]),
  objective: z.enum(["recommended", "fewest", "cleanest"]),
  allowedExtras: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  searchedAt: z.string(),
});

const storedDocumentSchema = z.object({
  version: z.literal(1),
  entries: z.array(storedEntrySchema),
});

export type BuilderHistoryEntry = Readonly<{
  targetId: PalId;
  passives: "any" | readonly PassiveId[];
  objective: BuilderObjective;
  allowedExtras: 0 | 1 | 2;
  searchedAt: string;
}>;

type BuilderHistoryStorage = Pick<Storage, "getItem" | "setItem">;
type Listener = () => void;

export class BuilderHistoryService {
  private readonly listeners = new Set<Listener>();
  private entries: readonly BuilderHistoryEntry[] | undefined;

  constructor(private readonly getStorage: () => BuilderHistoryStorage | undefined) {}

  getSnapshot = (): readonly BuilderHistoryEntry[] => {
    this.entries ??= this.read();
    return this.entries;
  };

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  record(search: BuilderSearchState, searchedAt = new Date().toISOString()) {
    const entry = createBuilderHistoryEntry(search, searchedAt);
    if (!entry) return;
    this.update(mergeBuilderHistory(this.getSnapshot(), entry));
  }

  remove(entry: BuilderHistoryEntry) {
    const key = getBuilderHistoryKey(entry);
    this.update(this.getSnapshot().filter((candidate) => getBuilderHistoryKey(candidate) !== key));
  }

  clear() {
    if (!this.getSnapshot().length) return;
    this.update([]);
  }

  reload() {
    this.entries = this.read();
    this.emit();
  }

  private read(): readonly BuilderHistoryEntry[] {
    try {
      const serialized = this.getStorage()?.getItem(BUILDER_HISTORY_STORAGE_KEY);
      if (!serialized) return [];
      const raw: unknown = JSON.parse(serialized);
      const document = storedDocumentSchema.safeParse(raw);
      if (!document.success) return [];
      return normalizeBuilderHistory(document.data.entries);
    } catch {
      return [];
    }
  }

  private update(entries: readonly BuilderHistoryEntry[]) {
    this.entries = entries;
    try {
      this.getStorage()?.setItem(BUILDER_HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
    } catch {
      // Keep history available for this session when persistent storage is unavailable.
    }
    this.emit();
  }

  private emit() {
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
  return [entry.targetId, passives, entry.objective, entry.allowedExtras].join("|");
}

function normalizeBuilderHistory(
  entries: readonly z.infer<typeof storedEntrySchema>[],
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

function getBrowserStorage(): BuilderHistoryStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export const builderHistoryService = new BuilderHistoryService(getBrowserStorage);

import { z } from "zod";
import type { PalId } from "../../domain/pal";
import type { SavePlatform } from "../../domain/saveImport";
import {
  compactSearch,
  normalizePalSearch,
  normalizeSearchQuery,
  normalizeStringParam,
  optionalStringSearchParam,
} from "../../routing/searchParams";

const rawInventorySearchSchema = z.object({
  modal: optionalStringSearchParam,
  platform: optionalStringSearchParam,
  start: optionalStringSearchParam,
  startQuery: optionalStringSearchParam,
  target: optionalStringSearchParam,
  targetQuery: optionalStringSearchParam,
});

export type InventorySearchState = {
  modal?: "add-pal";
  platform?: "steam";
  start?: string;
  startQuery?: string;
  target?: PalId;
  targetQuery?: string;
};

export function parseInventorySearch(search: Record<string, unknown>): InventorySearchState {
  const raw = rawInventorySearchSchema.parse(search);
  const start = normalizeStringParam(raw.start);
  const startQuery = normalizeSearchQuery(raw.startQuery);
  const target = normalizePalSearch(raw.target, raw.targetQuery);

  return compactSearch({
    modal: raw.modal === "add-pal" ? "add-pal" as const : undefined,
    platform: raw.platform === "steam" ? "steam" as const : undefined,
    start: startQuery ? undefined : start,
    startQuery,
    target: target.selectedId,
    targetQuery: target.query,
  });
}

export function getInventoryPlatform(search: InventorySearchState): SavePlatform {
  return search.platform ?? "xbox";
}

export function setInventoryPlatform(
  search: InventorySearchState,
  platform: SavePlatform,
): InventorySearchState {
  return compactSearch({ ...search, platform: platform === "steam" ? "steam" : undefined });
}

export function setInventoryStartInput(
  search: InventorySearchState,
  value: string,
): InventorySearchState {
  return compactSearch({ ...search, start: undefined, startQuery: normalizeSearchQuery(value) });
}

export function setInventoryStart(search: InventorySearchState, value: string): InventorySearchState {
  return compactSearch({ ...search, start: normalizeStringParam(value), startQuery: undefined });
}

export function setInventoryTargetInput(
  search: InventorySearchState,
  value: string,
): InventorySearchState {
  const target = normalizePalSearch(search.target, value);
  return compactSearch({
    ...search,
    target: target.selectedId,
    targetQuery: target.query,
  });
}

export function setInventoryTarget(
  search: InventorySearchState,
  value: PalId | undefined,
): InventorySearchState {
  return compactSearch({ ...search, target: value, targetQuery: undefined });
}

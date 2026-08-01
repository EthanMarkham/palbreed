import { z } from "zod";
import type { PalLocation } from "../../domain/inventory";
import type { PalGender } from "../../domain/pal";
import {
  compactSearch,
  normalizeSearchQuery,
  normalizeStringParam,
  optionalStringSearchParam,
} from "../../routing/searchParams";

export const inventoryIvFilterOptions = ["known", "average-70", "average-90"] as const;
export type InventoryIvFilter = (typeof inventoryIvFilterOptions)[number];

export const inventoryPassiveFilterOptions = ["with", "none"] as const;
export type InventoryPassiveFilter = (typeof inventoryPassiveFilterOptions)[number];

const inventoryLocationOptions: readonly PalLocation[] = [
  "party",
  "palbox",
  "base",
  "global-storage",
];
const inventoryGenderOptions: readonly PalGender[] = ["F", "M"];

const rawInventorySearchSchema = z.object({
  world: optionalStringSearchParam,
  q: optionalStringSearchParam,
  location: optionalStringSearchParam,
  gender: optionalStringSearchParam,
  iv: optionalStringSearchParam,
  passives: optionalStringSearchParam,
});

export type InventorySearchState = {
  world?: string;
  q?: string;
  location?: PalLocation;
  gender?: PalGender;
  iv?: InventoryIvFilter;
  passives?: InventoryPassiveFilter;
};

export type InventorySearchUpdate = Partial<
  Pick<InventorySearchState, "location" | "gender" | "iv" | "passives">
>;

export function parseInventorySearch(search: Record<string, unknown>): InventorySearchState {
  const raw = rawInventorySearchSchema.parse(search);

  return compactSearch({
    world: normalizeStringParam(raw.world),
    q: normalizeSearchQuery(raw.q),
    location: normalizeOption(raw.location, inventoryLocationOptions),
    gender: normalizeOption(raw.gender, inventoryGenderOptions),
    iv: normalizeOption(raw.iv, inventoryIvFilterOptions),
    passives: normalizeOption(raw.passives, inventoryPassiveFilterOptions),
  });
}

export function setInventoryWorld(
  search: InventorySearchState,
  world: string | undefined,
): InventorySearchState {
  return compactSearch({ ...search, world: normalizeStringParam(world) });
}

export function setInventoryQuery(
  search: InventorySearchState,
  query: string,
): InventorySearchState {
  return compactSearch({ ...search, q: normalizeSearchQuery(query) });
}

export function updateInventorySearch(
  search: InventorySearchState,
  update: InventorySearchUpdate,
): InventorySearchState {
  const merged = { ...search, ...update };
  return compactSearch({
    ...merged,
    location: normalizeOption(merged.location, inventoryLocationOptions),
    gender: normalizeOption(merged.gender, inventoryGenderOptions),
    iv: normalizeOption(merged.iv, inventoryIvFilterOptions),
    passives: normalizeOption(merged.passives, inventoryPassiveFilterOptions),
  });
}

export function clearInventoryFilters(search: InventorySearchState): InventorySearchState {
  return compactSearch({
    ...search,
    location: undefined,
    gender: undefined,
    iv: undefined,
    passives: undefined,
  });
}

export function resetInventoryView(search: InventorySearchState): InventorySearchState {
  return compactSearch({ ...clearInventoryFilters(search), q: undefined });
}

function normalizeOption<const T extends string>(
  value: unknown,
  options: readonly T[],
): T | undefined {
  return typeof value === "string" && options.includes(value as T)
    ? value as T
    : undefined;
}

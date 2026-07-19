import { z } from "zod";
import {
  compactSearch,
  normalizeSearchQuery,
  normalizeStringParam,
  optionalStringSearchParam,
} from "../../routing/searchParams";

const rawInventorySearchSchema = z.object({
  world: optionalStringSearchParam,
  q: optionalStringSearchParam,
});

export type InventorySearchState = {
  world?: string;
  q?: string;
};

export function parseInventorySearch(search: Record<string, unknown>): InventorySearchState {
  const raw = rawInventorySearchSchema.parse(search);

  return compactSearch({
    world: normalizeStringParam(raw.world),
    q: normalizeSearchQuery(raw.q),
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

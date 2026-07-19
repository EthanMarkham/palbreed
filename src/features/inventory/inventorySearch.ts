import { z } from "zod";
import type { SavePlatform } from "../../domain/saveImport";
import {
  compactSearch,
  optionalStringSearchParam,
} from "../../routing/searchParams";

const rawInventorySearchSchema = z.object({
  platform: optionalStringSearchParam,
});

export type InventorySearchState = {
  platform?: "steam";
};

export function parseInventorySearch(search: Record<string, unknown>): InventorySearchState {
  const raw = rawInventorySearchSchema.parse(search);

  return compactSearch({
    platform: raw.platform === "steam" ? "steam" as const : undefined,
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

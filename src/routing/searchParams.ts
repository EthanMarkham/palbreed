import { z } from "zod";
import { breedingRepository } from "../data/breedingRepository";
import type { PalId } from "../domain/pal";

/**
 * Search-param conventions:
 * - Parse and validate every route with validateSearch.
 * - Omit empty values and defaults from the URL.
 * - Preserve meaningful whitespace while a controlled search field is being typed.
 * - Replace history for continuous input; push history for committed selections/actions.
 * - Keep transient file handles, status messages, and unsubmitted modal drafts local.
 */
export type SearchUpdateMode = "replace" | "push";

export const optionalStringSearchParam = z.string().optional().catch(undefined);

export type PalSearchValue = {
  selectedId?: PalId;
  query?: string;
};

export function shouldReplaceSearch(mode: SearchUpdateMode): boolean {
  return mode === "replace";
}

export function compactSearch<T extends object>(search: T): T {
  const compacted = { ...search };
  for (const key in compacted) {
    if (compacted[key] === undefined) delete compacted[key];
  }
  return compacted;
}

export function normalizeStringParam(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

export function normalizeSearchQuery(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function normalizePalId(value: unknown): PalId | undefined {
  const palId = normalizeStringParam(value);
  return palId && breedingRepository.getPal(palId) ? palId : undefined;
}

export function normalizePalSearch(selectedValue: unknown, queryValue: unknown): PalSearchValue {
  const selectedId = normalizePalId(selectedValue);
  const query = normalizeSearchQuery(queryValue);
  if (!query) return selectedId ? { selectedId } : {};

  const selectedName = selectedId ? breedingRepository.getPal(selectedId)?.name : undefined;
  return selectedName && matchesSelectedLabel(query, selectedName)
    ? { selectedId }
    : { query };
}

export function matchesSelectedLabel(query: string, label: string): boolean {
  return query.trim().localeCompare(label, undefined, { sensitivity: "accent" }) === 0;
}

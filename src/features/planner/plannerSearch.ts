import { z } from "zod";
import { breedingRepository } from "../../data/breedingRepository";
import type { PalId } from "../../domain/pal";

const rawPlannerSearchSchema = z.object({
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  fromQuery: z.string().optional().catch(undefined),
  toQuery: z.string().optional().catch(undefined),
});

export type PlannerSearchState = {
  from?: PalId;
  to?: PalId;
  fromQuery?: string;
  toQuery?: string;
};

type PlannerField = "from" | "to";
type PlannerSearchInput = Partial<Record<keyof PlannerSearchState, string | undefined>>;

export function parsePlannerSearch(search: Record<string, unknown>): PlannerSearchState {
  return normalizePlannerSearch(rawPlannerSearchSchema.parse(search));
}

export function normalizePlannerSearch(search: PlannerSearchInput): PlannerSearchState {
  let from = normalizePalId(search.from);
  let to = normalizePalId(search.to);
  let fromQuery = normalizeQuery(search.fromQuery);
  let toQuery = normalizeQuery(search.toQuery);

  if (fromQuery) {
    const selectedName = from ? getPalName(from) : undefined;
    if (selectedName && matchesSelectedLabel(fromQuery, selectedName)) {
      fromQuery = undefined;
    } else {
      from = undefined;
    }
  }

  if (toQuery) {
    const selectedName = to ? getPalName(to) : undefined;
    if (selectedName && matchesSelectedLabel(toQuery, selectedName)) {
      toQuery = undefined;
    } else {
      to = undefined;
    }
  }

  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(fromQuery ? { fromQuery } : {}),
    ...(toQuery ? { toQuery } : {}),
  };
}

export function getPlannerInputValue(
  search: PlannerSearchState,
  field: PlannerField,
): string {
  const query = field === "from" ? search.fromQuery : search.toQuery;
  if (query) return query;

  const selectedId = field === "from" ? search.from : search.to;
  return selectedId ? getPalName(selectedId) ?? "" : "";
}

export function matchesSelectedLabel(query: string, label: string): boolean {
  return query.trim().localeCompare(label, undefined, { sensitivity: "accent" }) === 0;
}

function normalizePalId(value: string | undefined): PalId | undefined {
  if (!value) return undefined;
  return breedingRepository.getPal(value) ? value : undefined;
}

function normalizeQuery(value: string | undefined): string | undefined {
  const query = value?.trim();
  return query ? query : undefined;
}

function getPalName(palId: PalId): string | undefined {
  return breedingRepository.getPal(palId)?.name;
}

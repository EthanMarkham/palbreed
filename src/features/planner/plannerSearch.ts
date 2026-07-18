import { z } from "zod";
import type { PalId } from "../../domain/pal";
import {
  compactSearch,
  normalizePalSearch,
  optionalStringSearchParam,
} from "../../routing/searchParams";

const rawPlannerSearchSchema = z.object({
  from: optionalStringSearchParam,
  to: optionalStringSearchParam,
  fromQuery: optionalStringSearchParam,
  toQuery: optionalStringSearchParam,
});

export type PlannerSearchState = {
  from?: PalId;
  to?: PalId;
  fromQuery?: string;
  toQuery?: string;
};

type PlannerSearchInput = Partial<Record<keyof PlannerSearchState, string | undefined>>;

export function parsePlannerSearch(search: Record<string, unknown>): PlannerSearchState {
  return normalizePlannerSearch(rawPlannerSearchSchema.parse(search));
}

export function normalizePlannerSearch(search: PlannerSearchInput): PlannerSearchState {
  const from = normalizePalSearch(search.from, search.fromQuery);
  const to = normalizePalSearch(search.to, search.toQuery);
  return compactSearch({
    from: from.selectedId,
    to: to.selectedId,
    fromQuery: from.query,
    toQuery: to.query,
  });
}

import type { PalId } from "../../domain/pal";
import { normalizePalSearch } from "../../routing/searchParams";
import { normalizePlannerSearch, type PlannerSearchState } from "./plannerSearch";

type PlannerField = "from" | "to";
type PlannerQueryField = "fromQuery" | "toQuery";

export function setPlannerInput(
  search: PlannerSearchState,
  field: PlannerField,
  inputValue: string,
): PlannerSearchState {
  const queryField = getQueryField(field);
  const next = normalizePalSearch(search[field], inputValue);

  return normalizePlannerSearch({
    ...search,
    [field]: next.selectedId,
    [queryField]: next.query,
  });
}

export function setPlannerSelection(
  search: PlannerSearchState,
  field: PlannerField,
  selectedId: PalId | undefined,
): PlannerSearchState {
  return normalizePlannerSearch({
    ...search,
    [field]: selectedId,
    [getQueryField(field)]: undefined,
  });
}

export function swapPlannerSearch(search: PlannerSearchState): PlannerSearchState {
  return normalizePlannerSearch({
    from: search.to,
    to: search.from,
    fromQuery: search.toQuery,
    toQuery: search.fromQuery,
  });
}

function getQueryField(field: PlannerField): PlannerQueryField {
  return field === "from" ? "fromQuery" : "toQuery";
}

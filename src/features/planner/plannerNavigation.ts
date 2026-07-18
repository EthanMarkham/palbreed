import { breedingRepository } from "../../data/breedingRepository";
import type { PalId } from "../../domain/pal";
import {
  matchesSelectedLabel,
  normalizePlannerSearch,
  type PlannerSearchState,
} from "./plannerSearch";

type PlannerField = "from" | "to";
type PlannerQueryField = "fromQuery" | "toQuery";

export function setPlannerInput(
  search: PlannerSearchState,
  field: PlannerField,
  inputValue: string,
): PlannerSearchState {
  const queryField = getQueryField(field);
  const selectedId = search[field];
  const selectedName = selectedId ? breedingRepository.getPal(selectedId)?.name : undefined;
  const nextQuery = inputValue.trim() || undefined;

  return normalizePlannerSearch({
    ...search,
    [field]:
      nextQuery && selectedName && matchesSelectedLabel(nextQuery, selectedName)
        ? selectedId
        : undefined,
    [queryField]: nextQuery,
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

import type { PalId } from "../../domain/pal";
import { normalizePalSearch } from "../../routing/searchParams";
import { normalizePairSearch, type PairSearchState } from "./pairSearch";

type PairField = "first" | "second";

export function setPairInput(
  search: PairSearchState,
  field: PairField,
  value: string,
): PairSearchState {
  const queryField = field === "first" ? "firstQuery" : "secondQuery";
  const next = normalizePalSearch(search[field], value);

  return normalizePairSearch({
    ...search,
    [field]: next.selectedId,
    [queryField]: next.query,
  });
}

export function setPairSelection(
  search: PairSearchState,
  field: PairField,
  value: PalId | undefined,
): PairSearchState {
  return normalizePairSearch({
    ...search,
    [field]: value,
    [field === "first" ? "firstQuery" : "secondQuery"]: undefined,
  });
}

export function swapPairSearch(search: PairSearchState): PairSearchState {
  return normalizePairSearch({
    first: search.second,
    second: search.first,
    firstQuery: search.secondQuery,
    secondQuery: search.firstQuery,
  });
}

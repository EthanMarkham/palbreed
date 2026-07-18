import { z } from "zod";
import type { PalId } from "../../domain/pal";
import {
  compactSearch,
  normalizePalSearch,
  optionalStringSearchParam,
} from "../../routing/searchParams";

const rawPairSearchSchema = z.object({
  first: optionalStringSearchParam,
  second: optionalStringSearchParam,
  firstQuery: optionalStringSearchParam,
  secondQuery: optionalStringSearchParam,
});

export type PairSearchState = {
  first?: PalId;
  second?: PalId;
  firstQuery?: string;
  secondQuery?: string;
};

type PairSearchInput = Partial<Record<keyof PairSearchState, string | undefined>>;

export function parsePairSearch(search: Record<string, unknown>): PairSearchState {
  return normalizePairSearch(rawPairSearchSchema.parse(search));
}

export function normalizePairSearch(search: PairSearchInput): PairSearchState {
  const first = normalizePalSearch(search.first, search.firstQuery);
  const second = normalizePalSearch(search.second, search.secondQuery);
  return compactSearch({
    first: first.selectedId,
    second: second.selectedId,
    firstQuery: first.query,
    secondQuery: second.query,
  });
}

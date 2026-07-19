import { z } from "zod";
import type { PalId } from "../../domain/pal";
import {
  compactSearch,
  normalizePalSearch,
  optionalStringSearchParam,
} from "../../routing/searchParams";

const rawToolsSearchSchema = z.object({
  from: optionalStringSearchParam,
  to: optionalStringSearchParam,
  fromQuery: optionalStringSearchParam,
  toQuery: optionalStringSearchParam,
  first: optionalStringSearchParam,
  second: optionalStringSearchParam,
  firstQuery: optionalStringSearchParam,
  secondQuery: optionalStringSearchParam,
});

export type ToolsPalField = "from" | "to" | "first" | "second";

export type ToolsSearchState = {
  from?: PalId;
  to?: PalId;
  fromQuery?: string;
  toQuery?: string;
  first?: PalId;
  second?: PalId;
  firstQuery?: string;
  secondQuery?: string;
};

type ToolsSearchInput = Partial<Record<keyof ToolsSearchState, string | undefined>>;

const queryFieldBySelection = {
  from: "fromQuery",
  to: "toQuery",
  first: "firstQuery",
  second: "secondQuery",
} as const satisfies Record<ToolsPalField, keyof ToolsSearchState>;

export function parseToolsSearch(search: Record<string, unknown>): ToolsSearchState {
  return normalizeToolsSearch(rawToolsSearchSchema.parse(search));
}

export function setToolsInput(
  search: ToolsSearchState,
  field: ToolsPalField,
  inputValue: string,
): ToolsSearchState {
  const queryField = queryFieldBySelection[field];
  const next = normalizePalSearch(search[field], inputValue);
  return normalizeToolsSearch({
    ...search,
    [field]: next.selectedId,
    [queryField]: next.query,
  });
}

export function setToolsSelection(
  search: ToolsSearchState,
  field: ToolsPalField,
  selectedId: PalId | undefined,
): ToolsSearchState {
  return normalizeToolsSearch({
    ...search,
    [field]: selectedId,
    [queryFieldBySelection[field]]: undefined,
  });
}

export function swapToolsSelections(
  search: ToolsSearchState,
  feature: "path" | "parents",
): ToolsSearchState {
  const firstField = feature === "path" ? "from" : "first";
  const secondField = feature === "path" ? "to" : "second";
  const firstQueryField = queryFieldBySelection[firstField];
  const secondQueryField = queryFieldBySelection[secondField];
  return normalizeToolsSearch({
    ...search,
    [firstField]: search[secondField],
    [secondField]: search[firstField],
    [firstQueryField]: search[secondQueryField],
    [secondQueryField]: search[firstQueryField],
  });
}

function normalizeToolsSearch(search: ToolsSearchInput): ToolsSearchState {
  const from = normalizePalSearch(search.from, search.fromQuery);
  const to = normalizePalSearch(search.to, search.toQuery);
  const first = normalizePalSearch(search.first, search.firstQuery);
  const second = normalizePalSearch(search.second, search.secondQuery);
  return compactSearch({
    from: from.selectedId,
    to: to.selectedId,
    fromQuery: from.query,
    toQuery: to.query,
    first: first.selectedId,
    second: second.selectedId,
    firstQuery: first.query,
    secondQuery: second.query,
  });
}

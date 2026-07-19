import type { PalId } from "../../domain/pal";
import type { PassiveId } from "../../domain/passive";
import type { BuilderObjective } from "../../services/builder/palBuilder";
import {
  compactSearch,
  normalizePalSearch,
  normalizeSearchQuery,
} from "../../routing/searchParams";
import type { BuilderSearchState } from "./builderSearch";

export function setBuilderTargetInput(
  search: BuilderSearchState,
  value: string,
): BuilderSearchState {
  const target = normalizePalSearch(search.target, value);
  return compactSearch({
    ...search,
    target: target.selectedId,
    targetQuery: target.query,
    run: undefined,
  });
}

export function setBuilderTarget(
  search: BuilderSearchState,
  target: PalId | undefined,
): BuilderSearchState {
  return compactSearch({ ...search, target, targetQuery: undefined, run: undefined });
}

export function setBuilderPassives(
  search: BuilderSearchState,
  passives: readonly PassiveId[],
): BuilderSearchState {
  return compactSearch({
    ...search,
    passives: passives.length ? passives.join(",") : undefined,
    passiveQuery: undefined,
    run: undefined,
  });
}

export function setBuilderAnyPassives(search: BuilderSearchState, selected: boolean): BuilderSearchState {
  return compactSearch({
    ...search,
    passives: selected ? "any" : undefined,
    passiveQuery: undefined,
    run: undefined,
  });
}

export function setBuilderPassiveQuery(search: BuilderSearchState, value: string): BuilderSearchState {
  return compactSearch({ ...search, passiveQuery: normalizeSearchQuery(value) });
}

export function setBuilderObjective(search: BuilderSearchState, objective: BuilderObjective): BuilderSearchState {
  return compactSearch({ ...search, objective: objective === "recommended" ? undefined : objective, run: undefined });
}

export function setBuilderExtras(search: BuilderSearchState, extras: 0 | 1 | 2): BuilderSearchState {
  return compactSearch({ ...search, extras: extras || undefined, run: undefined });
}

export function runBuilderSearch(search: BuilderSearchState): BuilderSearchState {
  return compactSearch({ ...search, run: true });
}

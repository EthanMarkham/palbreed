import { z } from "zod";
import { passiveRepository } from "../../data/passiveRepository";
import type { PalId } from "../../domain/pal";
import type { PassiveGoal, PassiveId } from "../../domain/passive";
import type { BuilderObjective } from "../../services/builder/palBuilder";
import {
  compactSearch,
  normalizePalSearch,
  normalizeSearchQuery,
  optionalStringSearchParam,
} from "../../routing/searchParams";

const rawBuilderSearchSchema = z.object({
  target: optionalStringSearchParam,
  targetQuery: optionalStringSearchParam,
  passives: z.union([z.string(), z.array(z.string())]).optional().catch(undefined),
  passiveQuery: optionalStringSearchParam,
  objective: optionalStringSearchParam,
  extras: z.union([z.string(), z.number()]).optional().catch(undefined),
  run: z.union([z.string(), z.boolean()]).optional().catch(undefined),
});

export type BuilderSearchState = {
  target?: PalId;
  targetQuery?: string;
  passives?: string;
  passiveQuery?: string;
  objective?: Exclude<BuilderObjective, "recommended">;
  extras?: 1 | 2;
  run?: true;
};

export function parseBuilderSearch(search: Record<string, unknown>): BuilderSearchState {
  const raw = rawBuilderSearchSchema.parse(search);
  const target = normalizePalSearch(raw.target, raw.targetQuery);
  const passiveSelection = normalizePassiveSelection(raw.passives);
  const passiveQuery = normalizeSearchQuery(raw.passiveQuery);
  const objective = raw.objective === "fewest" || raw.objective === "cleanest"
    ? raw.objective
    : undefined;
  const numericExtras = Number(raw.extras);
  const extras = numericExtras === 1 || numericExtras === 2 ? numericExtras : undefined;
  const run = raw.run === true || raw.run === "true" || raw.run === "1" ? true : undefined;
  const serializedPassives = passiveSelection === "any"
    ? "any"
    : passiveSelection.join(",") || undefined;

  return compactSearch({
    target: target.selectedId,
    targetQuery: target.query,
    passives: serializedPassives,
    passiveQuery,
    objective,
    extras,
    run,
  });
}

export function getBuilderPassiveIds(search: BuilderSearchState): readonly PassiveId[] {
  const selection = normalizePassiveSelection(search.passives);
  return selection === "any" ? [] : selection;
}

export function getBuilderPassiveGoal(search: BuilderSearchState): PassiveGoal | undefined {
  const selection = normalizePassiveSelection(search.passives);
  if (selection === "any") return { kind: "any" };
  if (!selection.length) return undefined;
  return {
    kind: "specific",
    requiredIds: selection,
    allowedExtras: getBuilderExtras(search),
  };
}

export function getBuilderObjective(search: BuilderSearchState): BuilderObjective {
  return search.objective ?? "recommended";
}

export function getBuilderExtras(search: BuilderSearchState): 0 | 1 | 2 {
  return search.extras ?? 0;
}

function normalizePassiveSelection(value: string | readonly string[] | undefined): "any" | PassiveId[] {
  const values = (typeof value === "string" ? [value] : value ?? [])
    .flatMap((entry) => entry.split(","))
    .map((id) => id.trim());
  if (values.some((id) => id.toLowerCase() === "any")) return "any";
  const validIds = values
    .filter((id) => passiveRepository.get(id));
  return [...new Set(validIds)].slice(0, 4);
}

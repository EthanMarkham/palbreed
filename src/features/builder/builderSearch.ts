import { z } from "zod";
import { passiveRepository } from "../../data/passiveRepository";
import type { PalGender, PalId } from "../../domain/pal";
import type { PassiveId } from "../../domain/passive";
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
  gender: optionalStringSearchParam,
});

export type BuilderSearchState = {
  target?: PalId;
  targetQuery?: string;
  passives?: string;
  passiveQuery?: string;
  objective?: Exclude<BuilderObjective, "recommended">;
  extras?: 1 | 2;
  run?: true;
  gender?: "M";
};

export function parseBuilderSearch(search: Record<string, unknown>): BuilderSearchState {
  const raw = rawBuilderSearchSchema.parse(search);
  const target = normalizePalSearch(raw.target, raw.targetQuery);
  const passiveIds = normalizePassiveIds(raw.passives);
  const passiveQuery = normalizeSearchQuery(raw.passiveQuery);
  const objective = raw.objective === "fewest" || raw.objective === "cleanest"
    ? raw.objective
    : undefined;
  const numericExtras = Number(raw.extras);
  const extras = numericExtras === 1 || numericExtras === 2 ? numericExtras : undefined;
  const run = raw.run === true || raw.run === "true" || raw.run === "1" ? true : undefined;

  return compactSearch({
    target: target.selectedId,
    targetQuery: target.query,
    passives: passiveIds.length ? passiveIds.join(",") : undefined,
    passiveQuery,
    objective,
    extras,
    run,
    gender: raw.gender === "M" ? "M" as const : undefined,
  });
}

export function getBuilderPassiveIds(search: BuilderSearchState): readonly PassiveId[] {
  return normalizePassiveIds(search.passives);
}

export function getBuilderObjective(search: BuilderSearchState): BuilderObjective {
  return search.objective ?? "recommended";
}

export function getBuilderExtras(search: BuilderSearchState): 0 | 1 | 2 {
  return search.extras ?? 0;
}

export function getBuilderGender(search: BuilderSearchState): PalGender {
  return search.gender ?? "F";
}

function normalizePassiveIds(value: string | readonly string[] | undefined): PassiveId[] {
  const values: readonly string[] = typeof value === "string" ? value.split(",") : value ?? [];
  const validIds = values
    .map((id) => id.trim())
    .filter((id) => passiveRepository.get(id));
  return [...new Set(validIds)].slice(0, 4);
}

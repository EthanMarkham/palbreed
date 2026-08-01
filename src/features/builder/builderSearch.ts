import { z } from "zod";
import { passiveRepository } from "../../data/passiveRepository";
import type { PalId } from "../../domain/pal";
import type { PassiveGoal, PassiveId } from "../../domain/passive";
import type { BuilderIvGoal, BuilderObjective } from "../../services/builder/palBuilder";
import { normalizeIvMinimum } from "../../services/builder/ivProbability";
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
  ivHp: z.union([z.string(), z.number(), z.array(z.string())]).optional().catch(undefined),
  ivAttack: z.union([z.string(), z.number(), z.array(z.string())]).optional().catch(undefined),
  ivDefense: z.union([z.string(), z.number(), z.array(z.string())]).optional().catch(undefined),
  run: z.union([z.string(), z.boolean()]).optional().catch(undefined),
});

export type BuilderSearchState = {
  target?: PalId;
  targetQuery?: string;
  passives?: string;
  passiveQuery?: string;
  objective?: Exclude<BuilderObjective, "recommended">;
  ivHp?: number;
  ivAttack?: number;
  ivDefense?: number;
  run?: true;
};

export function parseBuilderSearch(search: Record<string, unknown>): BuilderSearchState {
  const raw = rawBuilderSearchSchema.parse(search);
  const target = normalizePalSearch(raw.target, raw.targetQuery);
  const passiveSelection = normalizePassiveSelection(raw.passives);
  const passiveQuery = normalizeSearchQuery(raw.passiveQuery);
  const objective = raw.objective === "fewest"
    || raw.objective === "cleanest"
    ? raw.objective
    : undefined;
  const ivHp = normalizeIvMinimumSearch(raw.ivHp);
  const ivAttack = normalizeIvMinimumSearch(raw.ivAttack);
  const ivDefense = normalizeIvMinimumSearch(raw.ivDefense);
  const run = raw.run === true || raw.run === "true" || raw.run === "1" ? true : undefined;
  const serializedPassives = passiveSelection.join(",") || undefined;

  return compactSearch({
    target: target.selectedId,
    targetQuery: target.query,
    passives: serializedPassives,
    passiveQuery,
    objective,
    ivHp,
    ivAttack,
    ivDefense,
    run,
  });
}

export function getBuilderPassiveIds(search: BuilderSearchState): readonly PassiveId[] {
  return normalizePassiveSelection(search.passives);
}

export function getBuilderPassiveGoal(search: BuilderSearchState): PassiveGoal {
  const selection = normalizePassiveSelection(search.passives);
  if (!selection.length) return { kind: "any" };
  return {
    kind: "specific",
    requiredIds: selection,
    allowedExtras: 4 - selection.length,
  };
}

export function getBuilderObjective(search: BuilderSearchState): BuilderObjective {
  return search.objective ?? "recommended";
}

export function getBuilderIvGoal(search: BuilderSearchState): BuilderIvGoal {
  return {
    ...(search.ivHp === undefined ? {} : { hp: search.ivHp }),
    ...(search.ivAttack === undefined ? {} : { attack: search.ivAttack }),
    ...(search.ivDefense === undefined ? {} : { defense: search.ivDefense }),
  };
}

function normalizePassiveSelection(value: string | readonly string[] | undefined): PassiveId[] {
  const values = (typeof value === "string" ? [value] : value ?? [])
    .flatMap((entry) => entry.split(","))
    .map((id) => id.trim())
    .filter((id) => id.toLowerCase() !== "any");
  const validIds = values
    .filter((id) => passiveRepository.get(id));
  return [...new Set(validIds)].slice(0, 4);
}

function normalizeIvMinimumSearch(value: string | number | readonly string[] | undefined) {
  const scalar = typeof value === "string" || typeof value === "number" ? value : value?.[0];
  if (scalar === undefined || (typeof scalar === "string" && !scalar.trim())) return undefined;
  return normalizeIvMinimum(typeof scalar === "number" ? scalar : Number(scalar));
}

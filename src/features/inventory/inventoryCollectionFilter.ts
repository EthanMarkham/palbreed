import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import type { OwnedPal } from "../../domain/inventory";

export function filterInventoryPals(
  pals: readonly OwnedPal[],
  query: string | undefined,
): readonly OwnedPal[] {
  const terms = query?.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean) ?? [];
  return [...pals]
    .filter((pal) => terms.every((term) => getSearchText(pal).includes(term)))
    .sort(compareInventoryPals);
}

export function getInventoryPalName(pal: OwnedPal): string {
  return pal.nickname || breedingRepository.getPal(pal.speciesId)?.name || pal.speciesId;
}

export function getInventoryPalSpeciesName(pal: OwnedPal): string {
  return breedingRepository.getPal(pal.speciesId)?.name || pal.speciesId;
}

function getSearchText(pal: OwnedPal): string {
  const passives = passiveRepository.resolve(pal.passiveIds).map(({ name }) => name);
  return [
    getInventoryPalName(pal),
    getInventoryPalSpeciesName(pal),
    pal.gender === "F" ? "female" : "male",
    pal.level ? `level ${pal.level}` : "",
    pal.location.replace(/-/g, " "),
    ...passives,
  ].join(" ").toLocaleLowerCase();
}

function compareInventoryPals(left: OwnedPal, right: OwnedPal): number {
  return getInventoryPalName(left).localeCompare(getInventoryPalName(right))
    || (right.level ?? 0) - (left.level ?? 0)
    || left.id.localeCompare(right.id);
}

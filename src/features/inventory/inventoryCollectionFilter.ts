import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import { getPalCombatStats } from "../../data/palStatsRepository";
import type { OwnedPal } from "../../domain/inventory";
import type {
  InventoryIvFilter,
  InventoryPassiveFilter,
} from "./inventorySearch";

export type InventoryCollectionFilter = {
  query?: string;
  location?: OwnedPal["location"];
  gender?: OwnedPal["gender"];
  iv?: InventoryIvFilter;
  passives?: InventoryPassiveFilter;
};

export type InventoryCopySort = "level-desc" | "iv-desc" | "name" | "location";

export type InventorySpeciesGroup = {
  speciesId: OwnedPal["speciesId"];
  speciesName: string;
  pals: readonly OwnedPal[];
};

export function filterInventoryPals(
  pals: readonly OwnedPal[],
  filter: InventoryCollectionFilter = {},
): readonly OwnedPal[] {
  const terms = filter.query?.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean) ?? [];
  return pals.filter((pal) => (
    terms.every((term) => getSearchText(pal).includes(term))
    && (!filter.location || pal.location === filter.location)
    && (!filter.gender || pal.gender === filter.gender)
    && matchesIvFilter(pal, filter.iv)
    && matchesPassiveFilter(pal, filter.passives)
  ));
}

export function groupInventoryPals(pals: readonly OwnedPal[]): readonly InventorySpeciesGroup[] {
  const palsBySpecies = new Map<OwnedPal["speciesId"], OwnedPal[]>();
  pals.forEach((pal) => {
    const group = palsBySpecies.get(pal.speciesId) ?? [];
    group.push(pal);
    palsBySpecies.set(pal.speciesId, group);
  });

  return [...palsBySpecies.entries()]
    .map(([speciesId, groupedPals]) => ({
      speciesId,
      speciesName: breedingRepository.getPal(speciesId)?.name ?? speciesId,
      pals: groupedPals,
    }))
    .sort((left, right) => left.speciesName.localeCompare(right.speciesName)
      || left.speciesId.localeCompare(right.speciesId));
}

export function sortInventoryCopies(
  pals: readonly OwnedPal[],
  sort: InventoryCopySort,
): readonly OwnedPal[] {
  return [...pals].sort(getInventoryCopyComparator(sort));
}

export function getInventoryPalName(pal: OwnedPal): string {
  return pal.nickname || breedingRepository.getPal(pal.speciesId)?.name || pal.speciesId;
}

export function getInventoryPalSpeciesName(pal: OwnedPal): string {
  return breedingRepository.getPal(pal.speciesId)?.name || pal.speciesId;
}

function getSearchText(pal: OwnedPal): string {
  const passives = passiveRepository.resolve(pal.passiveIds).map(({ name }) => name);
  const combatStats = getPalCombatStats(pal);
  return [
    getInventoryPalName(pal),
    getInventoryPalSpeciesName(pal),
    pal.level ? `level ${pal.level}` : "",
    pal.abilityScores
      ? [
          `iv hp ${pal.abilityScores.hp}`,
          `attack ${pal.abilityScores.ranged}`,
          `defense ${pal.abilityScores.defense}`,
          pal.abilityScores.melee === undefined ? "" : `melee ${pal.abilityScores.melee}`,
        ].join(" ")
      : "",
    combatStats
      ? `combat hp ${combatStats.hp} health ${combatStats.hp} attack ${combatStats.attack} damage ${combatStats.attack} defense ${combatStats.defense}`
      : "",
    ...passives,
  ].join(" ").toLocaleLowerCase();
}

export function getAverageCombatIv(pal: OwnedPal): number | undefined {
  if (!pal.abilityScores) return undefined;
  return Math.round(
    (pal.abilityScores.hp + pal.abilityScores.ranged + pal.abilityScores.defense) / 3,
  );
}

function matchesIvFilter(pal: OwnedPal, filter: InventoryIvFilter | undefined) {
  if (!filter) return true;
  const average = getAverageCombatIv(pal);
  if (filter === "known") return average !== undefined;
  if (average === undefined) return false;
  return average >= (filter === "average-90" ? 90 : 70);
}

function matchesPassiveFilter(pal: OwnedPal, filter: InventoryPassiveFilter | undefined) {
  if (!filter) return true;
  return filter === "with" ? pal.passiveIds.length > 0 : pal.passiveIds.length === 0;
}

function getInventoryCopyComparator(sort: InventoryCopySort) {
  if (sort === "level-desc") {
    return (left: OwnedPal, right: OwnedPal) => compareOptionalNumbers(left.level, right.level, "desc")
      || compareOptionalNumbers(getAverageCombatIv(left), getAverageCombatIv(right), "desc")
      || compareInventoryPalNames(left, right);
  }
  if (sort === "iv-desc") {
    return (left: OwnedPal, right: OwnedPal) => compareOptionalNumbers(
      getAverageCombatIv(left),
      getAverageCombatIv(right),
      "desc",
    ) || compareOptionalNumbers(left.level, right.level, "desc")
      || compareInventoryPalNames(left, right);
  }
  if (sort === "location") {
    const locationOrder: Record<OwnedPal["location"], number> = {
      party: 0,
      base: 1,
      "global-storage": 2,
      palbox: 3,
    };
    return (left: OwnedPal, right: OwnedPal) => locationOrder[left.location] - locationOrder[right.location]
      || compareOptionalNumbers(left.palboxSlotIndex, right.palboxSlotIndex, "asc")
      || compareInventoryPalNames(left, right);
  }
  return compareInventoryPalNames;
}

function compareOptionalNumbers(
  left: number | undefined,
  right: number | undefined,
  direction: "asc" | "desc",
) {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  return direction === "asc" ? left - right : right - left;
}

function compareInventoryPalNames(left: OwnedPal, right: OwnedPal): number {
  return getInventoryPalName(left).localeCompare(getInventoryPalName(right))
    || (right.level ?? 0) - (left.level ?? 0)
    || left.id.localeCompare(right.id);
}

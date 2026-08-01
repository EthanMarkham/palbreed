import type { InventoryProfile, OwnedPal } from "../../domain/inventory";

type ComparableImportedProfile = Pick<
  InventoryProfile,
  | "name"
  | "platform"
  | "worldId"
  | "slotId"
  | "accountId"
  | "playerId"
  | "playerName"
  | "playerLevel"
  | "normalizationVersion"
  | "pals"
>;

export function importedProfileMatches(
  profile: ComparableImportedProfile,
  input: ComparableImportedProfile,
) {
  return canonicalImportedProfile(profile) === canonicalImportedProfile(input);
}

function canonicalImportedProfile(
  profile: ComparableImportedProfile,
) {
  return JSON.stringify([
    profile.platform,
    profile.worldId ?? null,
    profile.slotId ?? null,
    profile.accountId ?? null,
    profile.playerId ?? null,
    profile.playerName ?? null,
    profile.playerLevel ?? null,
    profile.normalizationVersion,
    [...profile.pals]
      .sort(comparePals)
      .map(canonicalPal),
  ]);
}

function comparePals(first: OwnedPal, second: OwnedPal) {
  return first.sourceInstanceId.localeCompare(second.sourceInstanceId)
    || first.id.localeCompare(second.id);
}

function canonicalPal(pal: OwnedPal) {
  return [
    pal.id,
    pal.sourceInstanceId,
    pal.speciesId,
    pal.gender,
    [...pal.passiveIds].sort(),
    pal.location,
    pal.palboxSlotIndex ?? null,
    pal.worldId ?? null,
    pal.playerId ?? null,
    pal.nickname ?? null,
    pal.level ?? null,
    pal.abilityScores
      ? [
          pal.abilityScores.hp,
          pal.abilityScores.melee ?? null,
          pal.abilityScores.ranged,
          pal.abilityScores.defense,
        ]
      : null,
  ];
}

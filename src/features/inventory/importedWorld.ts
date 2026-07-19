import type { ImportedPlayer } from "../../domain/saveImport";

export function describeImportedWorld(
  fallbackName: string,
  players: readonly ImportedPlayer[],
) {
  const player = players.length === 1 ? players[0] : undefined;
  if (!player?.name) {
    return {
      name: player?.level ? `${fallbackName} · Level ${player.level}` : fallbackName,
      player,
    };
  }
  return {
    name: player.level ? `${player.name} · Level ${player.level}` : player.name,
    player,
  };
}

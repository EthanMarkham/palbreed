import passiveData from "./passives-runtime-1.0.json";
import type { PassiveDefinition, PassiveId } from "../domain/passive";

const passives: readonly PassiveDefinition[] = passiveData.passives;
const byId = new Map(passives.map((passive) => [passive.id, passive]));

export const passiveRepository = {
  gameVersion: passiveData.gameVersion,
  all: (): readonly PassiveDefinition[] => passives,
  get: (id: PassiveId): PassiveDefinition | undefined => byId.get(id),
  resolve: (ids: readonly PassiveId[]): readonly PassiveDefinition[] =>
    ids.flatMap((id) => {
      const passive = byId.get(id);
      return passive ? [passive] : [];
    }),
};

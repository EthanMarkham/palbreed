export interface RawSavePal {
  speciesId: string;
  gender?: string;
  passiveIds: string[];
  instanceId?: string;
  containerId?: string;
  containerSlotIndex?: number;
  nickname?: string;
  level?: number;
  abilityScores?: {
    hp: number;
    melee?: number;
    ranged: number;
    defense: number;
  };
}

export interface RawSavePlayer {
  id?: string;
  name?: string;
  level?: number;
}

export interface RawPlayerContainers {
  palboxContainerId?: string;
  partyContainerId?: string;
}

export interface RawPalContainerSlot {
  instanceId: string;
  slotIndex: number;
  containerId?: string;
}

/**
 * Reads the stable Pal fields from uesave's lossless JSON model. Palworld 1.0
 * appends numeric schema suffixes to property names, so every key comparison
 * deliberately ignores a terminal `_N` segment.
 */
export function normalizePalsFromParsedSave(root: unknown): RawSavePal[] {
  return findSaveParameters(root).map(({ parameter, context }) => {
    const slotId = findNamedValue(parameter, "SlotId");
    return {
      speciesId: stringValue(findNamedValue(parameter, "CharacterID")) ?? "",
      gender: stringValue(findNamedValue(parameter, "Gender")),
      passiveIds: stringArrayValue(findNamedValue(parameter, "PassiveSkillList")),
      instanceId: guidValue(findNamedValue(context, "InstanceId"))
        ?? stringValue(findNamedValue(context, "InstanceId")),
      containerId: guidValue(findNamedValue(slotId, "ContainerId")),
      containerSlotIndex: nonNegativeInteger(findNamedValue(slotId, "SlotIndex")),
      nickname:
        stringValue(findNamedValue(parameter, "NickName"))
        ?? stringValue(findNamedValue(parameter, "Nickname")),
      level: numberValue(findNamedValue(parameter, "Level")),
      abilityScores: readAbilityScores(parameter),
    };
  });
}

export function normalizePlayerContainersFromParsedSave(root: unknown): RawPlayerContainers {
  return {
    palboxContainerId: guidValue(findNamedValue(root, "PalStorageContainerId")),
    partyContainerId: guidValue(findNamedValue(root, "OtomoCharacterContainerId")),
  };
}

/**
 * Reads the authoritative container slot table. A Pal's embedded SlotId can
 * lag behind a move, while CharacterContainerSaveData represents the current
 * Palbox layout.
 */
export function normalizePalContainerSlotsFromParsedSave(root: unknown): RawPalContainerSlot[] {
  const containerData = findNamedValue(root, "CharacterContainerSaveData");
  if (!containerData) return [];
  const slots = new Map<string, RawPalContainerSlot>();
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number, containerId?: string) => {
    if (!value || typeof value !== "object" || seen.has(value) || depth > 60) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, depth + 1, containerId));
      return;
    }
    const record = value as Record<string, unknown>;
    const recordContainerId = record.key
      && "value" in record
      && findNamedValue(record.value, "Slots") !== undefined
        ? guidValue(record.key)
        : undefined;
    const currentContainerId = recordContainerId ?? containerId;
    const slotIndex = nonNegativeInteger(findDirectNamedValue(record, "SlotIndex"));
    const instanceId = guidValue(
      findNamedValue(record, "instance_id") ?? findNamedValue(record, "InstanceId"),
    );
    if (slotIndex !== undefined && instanceId) {
      slots.set(instanceId, { instanceId, slotIndex, containerId: currentContainerId });
    }
    Object.values(record).forEach((child) => visit(child, depth + 1, currentContainerId));
  };
  visit(containerData, 0);
  return [...slots.values()];
}

function readAbilityScores(parameter: unknown): RawSavePal["abilityScores"] {
  const hp = abilityScore(parameter, "Talent_HP");
  const melee = abilityScore(parameter, "Talent_Melee");
  const ranged = abilityScore(parameter, "Talent_Shot");
  const defense = abilityScore(parameter, "Talent_Defense");
  return hp === undefined || ranged === undefined || defense === undefined
    ? undefined
    : { hp, melee, ranged, defense };
}

function abilityScore(parameter: unknown, field: string) {
  const value = numberValue(findNamedValue(parameter, field));
  return value !== undefined && Number.isInteger(value) && value >= 0 && value <= 100
    ? value
    : undefined;
}

export function normalizePlayersFromParsedSave(root: unknown): RawSavePlayer[] {
  return findSaveParameters(root).flatMap(({ parameter, context }) => {
    const characterId = stringValue(findNamedValue(parameter, "CharacterID"));
    if (!characterId || !/player/i.test(characterId)) return [];
    const id = normalizePlayerId(
      stringValue(findNamedValue(context, "PlayerUId"))
      ?? stringValue(findNamedValue(context, "PlayerUID")),
    );
    const name =
      stringValue(findNamedValue(parameter, "NickName"))
      ?? stringValue(findNamedValue(parameter, "Nickname"))
      ?? stringValue(findNamedValue(parameter, "PlayerName"));
    const level = numberValue(findNamedValue(parameter, "Level"));
    return id || name || level !== undefined ? [{ id, name, level }] : [];
  });
}

function findSaveParameters(root: unknown) {
  const found: Array<{ parameter: unknown; context: unknown }> = [];
  const seen = new Set<unknown>();
  const ancestors: unknown[] = [];
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || seen.has(value) || depth > 60) return;
    seen.add(value);
    if (Array.isArray(value)) {
      ancestors.push(value);
      value.forEach((entry) => visit(entry, depth + 1));
      ancestors.pop();
      return;
    }
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (normalizeKey(key) === "saveparameter") {
        const context = findInstanceContext(value, ancestors);
        found.push({ parameter: child, context });
      }
    }
    ancestors.push(value);
    Object.values(record).forEach((child) => visit(child, depth + 1));
    ancestors.pop();
  };
  visit(root, 0);
  return found;
}

function findInstanceContext(current: unknown, ancestors: readonly unknown[]) {
  if (hasCharacterIdentity(current)) return current;
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const candidate = ancestors[index];
    if (hasCharacterIdentity(candidate)) return candidate;
  }
  return current;
}

function hasCharacterIdentity(value: unknown) {
  return findNamedValue(value, "InstanceId") !== undefined
    || findNamedValue(value, "PlayerUId") !== undefined
    || findNamedValue(value, "PlayerUID") !== undefined;
}

function findNamedValue(root: unknown, target: string, depth = 0, seen = new Set<unknown>()): unknown {
  if (!root || typeof root !== "object" || depth > 14 || seen.has(root)) return undefined;
  seen.add(root);
  if (Array.isArray(root)) {
    for (const value of root) {
      const found = findNamedValue(value, target, depth + 1, seen);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = root as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (normalizeKey(key) === normalizeKey(target)) return value;
  }
  const keyName = stringValue(record.key);
  if (keyName && normalizeKey(keyName) === normalizeKey(target) && "value" in record) return record.value;
  for (const value of Object.values(record)) {
    const found = findNamedValue(value, target, depth + 1, seen);
    if (found !== undefined) return found;
  }
  return undefined;
}

function stringValue(value: unknown, depth = 0): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || depth > 8) return undefined;
  if (Array.isArray(value)) {
    for (const child of value) {
      const result = stringValue(child, depth + 1);
      if (result) return result;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const preferred = ["Name", "Enum", "Str", "String", "Text", "value", "Value"];
  for (const key of preferred) {
    if (key in record) {
      const result = stringValue(record[key], depth + 1);
      if (result) return result;
    }
  }
  if (Object.keys(record).length === 1) return stringValue(Object.values(record)[0], depth + 1);
  return undefined;
}

function stringArrayValue(value: unknown, depth = 0): string[] {
  if (depth > 10 || value == null) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((child) => stringArrayValue(child, depth + 1));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["Array", "Name", "values", "value", "Value"]) {
      if (key in record) return stringArrayValue(record[key], depth + 1);
    }
    if (Object.keys(record).length === 1) return stringArrayValue(Object.values(record)[0], depth + 1);
  }
  return [];
}

function numberValue(value: unknown, depth = 0): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || depth > 8) return undefined;
  for (const child of Object.values(value as Record<string, unknown>)) {
    const number = numberValue(child, depth + 1);
    if (number !== undefined) return number;
  }
  return undefined;
}

function findDirectNamedValue(record: Record<string, unknown>, target: string) {
  for (const [key, value] of Object.entries(record)) {
    if (normalizeKey(key) === normalizeKey(target)) return value;
  }
  const keyName = stringValue(record.key);
  return keyName && normalizeKey(keyName) === normalizeKey(target) && "value" in record
    ? record.value
    : undefined;
}

function nonNegativeInteger(value: unknown) {
  const number = numberValue(value);
  return number !== undefined && Number.isInteger(number) && number >= 0
    ? number
    : undefined;
}

function guidValue(value: unknown, depth = 0): string | undefined {
  if (typeof value === "string") {
    const compact = value.replace(/[^a-f\d]/gi, "");
    return compact.length === 32 ? value.toLocaleLowerCase() : undefined;
  }
  if (!value || typeof value !== "object" || depth > 10) return undefined;
  for (const child of Object.values(value as Record<string, unknown>)) {
    const guid = guidValue(child, depth + 1);
    if (guid) return guid;
  }
  return undefined;
}

function normalizeKey(value: string) {
  return value
    .replace(/_\d+$/g, "")
    .replace(/[^a-z\d]/gi, "")
    .toLocaleLowerCase();
}

function normalizePlayerId(value?: string) {
  if (!value) return undefined;
  const compact = value.replace(/[^a-f\d]/gi, "").toLocaleLowerCase();
  return compact.length === 32 ? compact : value.toLocaleLowerCase();
}

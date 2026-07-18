export interface RawSavePal {
  speciesId: string;
  gender?: string;
  passiveIds: string[];
  instanceId?: string;
  nickname?: string;
  level?: number;
}

/**
 * Reads the stable Pal fields from uesave's lossless JSON model. Palworld 1.0
 * appends numeric schema suffixes to property names, so every key comparison
 * deliberately ignores a terminal `_N` segment.
 */
export function normalizePalsFromParsedSave(root: unknown): RawSavePal[] {
  return findSaveParameters(root).map(({ parameter, context }) => ({
    speciesId: stringValue(findNamedValue(parameter, "CharacterID")) ?? "",
    gender: stringValue(findNamedValue(parameter, "Gender")),
    passiveIds: stringArrayValue(findNamedValue(parameter, "PassiveSkillList")),
    instanceId: stringValue(findNamedValue(context, "InstanceId")),
    nickname:
      stringValue(findNamedValue(parameter, "NickName"))
      ?? stringValue(findNamedValue(parameter, "Nickname")),
    level: numberValue(findNamedValue(parameter, "Level")),
  }));
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
  if (findNamedValue(current, "InstanceId") !== undefined) return current;
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const candidate = ancestors[index];
    if (findNamedValue(candidate, "InstanceId") !== undefined) return candidate;
  }
  return current;
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

function normalizeKey(value: string) {
  return value
    .replace(/_\d+$/g, "")
    .replace(/[^a-z\d]/gi, "")
    .toLocaleLowerCase();
}

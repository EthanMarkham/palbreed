export type PalId = string;

export type Pal = {
  id: PalId;
  name: string;
  image?: string;
  elements: readonly string[];
  breedable: boolean;
};

export type ParentPair = readonly [PalId, PalId];

export type LineageStep = {
  from: PalId;
  partners: readonly PalId[];
  result: PalId;
};

export type LineageResult =
  | { status: "found"; steps: readonly LineageStep[] }
  | { status: "same-pal"; steps: readonly [] }
  | { status: "no-route"; reason: string }
  | { status: "invalid-input"; reason: string };

export function pairKey(first: PalId, second: PalId): string {
  return [first, second].sort((a, b) => a.localeCompare(b)).join("|");
}

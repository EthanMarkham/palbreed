export type PalId = string;
export type PalGender = "F" | "M";

export type Pal = {
  id: PalId;
  number: number;
  name: string;
  image: string;
};

export type ParentPair = readonly [PalId, PalId];

export type GenderRequirement = {
  firstGender: PalGender;
  secondGender: PalGender;
};

export type LineageStep = {
  from: PalId;
  partner: PalId;
  result: PalId;
  fromGender?: PalGender;
  partnerGender?: PalGender;
};

export type LineageResult =
  | { status: "found"; steps: readonly LineageStep[] }
  | { status: "same-pal" }
  | { status: "no-route"; reason: string }
  | { status: "invalid-input"; reason: string };

export function pairKey(first: PalId, second: PalId): string {
  return first.localeCompare(second) <= 0
    ? `${first}|${second}`
    : `${second}|${first}`;
}

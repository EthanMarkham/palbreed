export type PassiveId = string;

export type PassiveDefinition = {
  id: PassiveId;
  name: string;
  description: string;
  rank: number;
  randomEligible: boolean;
};

export type PassiveGoal =
  | { kind: "any" }
  | {
      kind: "specific";
      requiredIds: readonly PassiveId[];
      allowedExtras: 0 | 1 | 2;
    };

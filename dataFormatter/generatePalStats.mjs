import { readFile, writeFile } from "node:fs/promises";

const [sourcePath, breedingPath, outputPath] = process.argv.slice(2);

if (!sourcePath || !breedingPath || !outputPath) {
  throw new Error(
    "Usage: node dataFormatter/generatePalStats.mjs <palcalc-db.json> <breeding-1.0.json> <output.json>",
  );
}

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const breeding = JSON.parse(await readFile(breedingPath, "utf8"));
const sourcePals = new Map(
  source.Pals.map((pal) => [
    `${pal.Id.PalDexNo}:${Boolean(pal.Id.IsVariant)}`,
    pal,
  ]),
);

const stats = Object.fromEntries(
  Object.values(breeding.palsById)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((pal) => {
      const sourcePal = sourcePals.get(`${pal.dexNumber}:${Boolean(pal.isVariant)}`);
      if (!sourcePal) throw new Error(`Missing stats for ${pal.id}.`);
      return [
        pal.id,
        {
          hp: Number(sourcePal.Hp),
          attack: Number(sourcePal.Attack),
          defense: Number(sourcePal.Defense),
        },
      ];
    }),
);

const genderProbabilities = Object.fromEntries(
  Object.values(breeding.palsById)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((pal) => {
      const sourcePal = sourcePals.get(`${pal.dexNumber}:${Boolean(pal.isVariant)}`);
      if (!sourcePal) throw new Error(`Missing gender probabilities for ${pal.id}.`);
      const probabilities = source.BreedingGenderProbability[sourcePal.InternalName];
      const female = Number(probabilities?.FEMALE);
      const male = Number(probabilities?.MALE);
      if (
        !Number.isFinite(female)
        || !Number.isFinite(male)
        || female <= 0
        || male <= 0
        || Math.abs(female + male - 1) > 1e-6
      ) {
        throw new Error(`Invalid gender probabilities for ${pal.id}.`);
      }
      return [pal.id, { F: female, M: male }];
    }),
);

await writeFile(
  outputPath,
  `${JSON.stringify({
    metadata: {
      gameVersion: "1.0",
      source: "PalCalc.Model/db.json",
      sourceCommit: "0055422d9cee4b65457fdb1544b248b76ef16805",
    },
    stats,
    genderProbabilities,
  }, null, 2)}\n`,
  "utf8",
);

console.log(
  `Generated combat coefficients and gender probabilities for ${Object.keys(stats).length} Pals.`,
);

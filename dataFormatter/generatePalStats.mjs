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

await writeFile(
  outputPath,
  `${JSON.stringify({
    metadata: {
      gameVersion: "1.0",
      source: "PalCalc.Model/db.json",
      sourceCommit: "be2ec7a95c521dea6591469c051e7cb0f6658065",
    },
    stats,
  }, null, 2)}\n`,
  "utf8",
);

console.log(`Generated combat coefficients for ${Object.keys(stats).length} Pals.`);

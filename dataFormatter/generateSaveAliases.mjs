import { readFile, writeFile } from "node:fs/promises";

const [palDataPath, localizationPath, breedingPath, outputPath] = process.argv.slice(2);
if (!palDataPath || !localizationPath || !breedingPath || !outputPath) {
  throw new Error(
    "Usage: node dataFormatter/generateSaveAliases.mjs <pals.json> <pal-l10n.json> <breeding-runtime.json> <output.json>",
  );
}

const palData = JSON.parse(await readFile(palDataPath, "utf8"));
const localization = JSON.parse(await readFile(localizationPath, "utf8"));
const breeding = JSON.parse(await readFile(breedingPath, "utf8"));
const canonicalByName = new Map(
  breeding.pals.map((pal) => [pal.name.toLocaleLowerCase("en-US"), pal.id]),
);

const aliases = Object.entries(palData)
  .filter(([, value]) => value.is_pal === true)
  .flatMap(([saveId]) => {
    const name = localization[saveId]?.localized_name;
    const canonicalId = name ? canonicalByName.get(name.toLocaleLowerCase("en-US")) : undefined;
    return canonicalId ? [[saveId, canonicalId]] : [];
  })
  .sort(([first], [second]) => first.localeCompare(second));
const ignoredIds = Object.entries(palData)
  .filter(([, value]) => value.is_pal !== true)
  .map(([saveId]) => saveId)
  .sort((first, second) => first.localeCompare(second));

await writeFile(
  outputPath,
  `${JSON.stringify({ gameVersion: "1.0", aliases: Object.fromEntries(aliases), ignoredIds }, null, 2)}\n`,
  "utf8",
);
console.log(`Generated ${aliases.length} Palworld save aliases.`);

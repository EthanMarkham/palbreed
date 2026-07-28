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
const canonicalIds = new Set(breeding.pals.map((pal) => pal.id));

// Some save IDs share a localized name even though they are distinct breeding
// species. Keep those mappings keyed by the stable game ID instead of allowing
// name matching to collapse the variants.
const canonicalBySaveId = new Map([
  ["PlantSlime_Flower", "gumoss-special"],
]);

for (const [saveId, canonicalId] of canonicalBySaveId) {
  if (!canonicalIds.has(canonicalId)) {
    throw new Error(`Save alias override ${saveId} references unknown Pal ${canonicalId}.`);
  }
}

const aliases = Object.entries(palData)
  .filter(([, value]) => value.is_pal === true)
  .flatMap(([saveId]) => {
    const name = localization[saveId]?.localized_name;
    const canonicalId = canonicalBySaveId.get(saveId)
      ?? (name ? canonicalByName.get(name.toLocaleLowerCase("en-US")) : undefined);
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

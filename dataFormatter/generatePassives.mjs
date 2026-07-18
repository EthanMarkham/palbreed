import { readFile, writeFile } from "node:fs/promises";

const [sourcePath, localizationPath, palsPath, itemsPath, outputPath] = process.argv.slice(2);

if (!sourcePath || !localizationPath || !palsPath || !itemsPath || !outputPath) {
  throw new Error(
    "Usage: node dataFormatter/generatePassives.mjs <passive_skills.json> <localization.json> <pals.json> <items.json> <output.json>",
  );
}

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const localization = JSON.parse(await readFile(localizationPath, "utf8"));
const pals = JSON.parse(await readFile(palsPath, "utf8"));
const items = JSON.parse(await readFile(itemsPath, "utf8"));
const fixedPalPassives = new Set(
  Object.values(pals)
    .filter((pal) => pal.is_pal === true && pal.disabled !== true)
    .flatMap((pal) => pal.passive_skills ?? []),
);
const consumablePassives = new Set(
  Object.keys(items)
    .filter((id) => id.startsWith("PalPassiveSkillChange_Consumable_"))
    .map((id) => id.slice("PalPassiveSkillChange_Consumable_".length))
    .filter((id) => source[id]),
);

const passives = Object.entries(source)
  .filter(([id, value]) =>
    value.disabled !== true
    && (value.add_pal === true || fixedPalPassives.has(id) || consumablePassives.has(id)),
  )
  .map(([id, value]) => ({
    id,
    name: localization[id]?.localized_name ?? id,
    description: cleanLocalization(localization[id]?.description),
    rank: Number(value.rank ?? 0),
    randomEligible: value.add_pal === true,
  }))
  .sort((first, second) => first.name.localeCompare(second.name));

await writeFile(
  outputPath,
  `${JSON.stringify({ gameVersion: "1.0", passives }, null, 2)}\n`,
  "utf8",
);

console.log(`Generated ${passives.length} obtainable Pal passives for Palworld 1.0.`);

function cleanLocalization(value) {
  if (!value) return "No in-game description is available.";
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

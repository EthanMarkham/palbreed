import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SOURCE_PAGE = "https://palbreeder.com/";
const ICON_BASE_URL = new URL("/pal-icons/", DEFAULT_SOURCE_PAGE).href;
const OUTPUT_PATH = new URL("../src/data/breeding-1.0.json", import.meta.url);
const RUNTIME_OUTPUT_PATH = new URL("../src/data/breeding-runtime-1.0.json", import.meta.url);
const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

const source = await loadSource(process.argv[2]);
const { payload, sourceText } = extractPayload(source.text);
const artifact = buildArtifact(payload, source.url, sourceText);
const runtimeArtifact = buildRuntimeArtifact(payload, artifact);

await Promise.all([
  writeFile(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8"),
  writeFile(RUNTIME_OUTPUT_PATH, `${JSON.stringify(runtimeArtifact)}\n`, "utf8"),
]);

console.log(
  `Generated ${artifact.metadata.palCount} Pals and ${artifact.metadata.parentPairCount} parent pairs in ${path.normalize(OUTPUT_PATH.pathname.slice(1))} and ${path.normalize(RUNTIME_OUTPUT_PATH.pathname.slice(1))}.`,
);

async function loadSource(sourceArgument) {
  if (sourceArgument && /^https?:\/\//i.test(sourceArgument)) {
    return { url: sourceArgument, text: await fetchText(sourceArgument) };
  }

  if (sourceArgument) {
    const filePath = path.resolve(process.cwd(), sourceArgument);
    return { url: `file://${filePath.replaceAll("\\", "/")}`, text: await readFile(filePath, "utf8") };
  }

  const page = await fetchText(DEFAULT_SOURCE_PAGE);
  const chunkUrls = [
    ...new Set(
      [...page.matchAll(/["']([^"']*\/_next\/static\/chunks\/[^"']+\.js[^"']*)["']/g)].map(
        ([, chunkPath]) => new URL(chunkPath, DEFAULT_SOURCE_PAGE).href,
      ),
    ),
  ];

  for (const chunkUrl of chunkUrls) {
    const text = await fetchText(chunkUrl);
    if (text.includes('JSON.parse(\'{"version":"1.0"')) return { url: chunkUrl, text };
  }

  throw new Error(`Could not find the 1.0 data bundle linked by ${DEFAULT_SOURCE_PAGE}.`);
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "pal-breeder-data-generator/1.0" } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response.text();
}

function extractPayload(bundleText) {
  const marker = "JSON.parse('";
  let markerIndex = bundleText.indexOf(marker);

  while (markerIndex >= 0) {
    const parsedString = parseSingleQuotedString(bundleText, markerIndex + marker.length);
    if (parsedString.value.startsWith('{"version":"1.0"')) {
      return { payload: JSON.parse(parsedString.value), sourceText: parsedString.value };
    }
    markerIndex = bundleText.indexOf(marker, parsedString.end + 1);
  }

  throw new Error("The source bundle does not contain a Palworld 1.0 payload.");
}

function parseSingleQuotedString(source, start) {
  let value = "";

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "'") return { value, end: index };
    if (character !== "\\") {
      value += character;
      continue;
    }

    index += 1;
    const escaped = source[index];
    const simpleEscapes = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v" };
    if (escaped in simpleEscapes) {
      value += simpleEscapes[escaped];
    } else if (escaped === "x") {
      value += String.fromCodePoint(parseInt(source.slice(index + 1, index + 3), 16));
      index += 2;
    } else if (escaped === "u") {
      const isCodePoint = source[index + 1] === "{";
      const end = isCodePoint ? source.indexOf("}", index + 2) : index + 5;
      const hexadecimal = source.slice(index + (isCodePoint ? 2 : 1), end);
      value += String.fromCodePoint(parseInt(hexadecimal, 16));
      index = end;
    } else if (escaped === "\r" || escaped === "\n") {
      if (escaped === "\r" && source[index + 1] === "\n") index += 1;
    } else {
      value += escaped;
    }
  }

  throw new Error("Unterminated JSON.parse string in source bundle.");
}

function buildArtifact(raw, sourceUrl, sourceText) {
  validateRawData(raw);

  const palIds = raw.pals.map((pal) => pal.s);
  const palsById = Object.fromEntries(
    raw.pals.map((pal) => [
      pal.s,
      {
        id: pal.s,
        name: pal.n,
        dexNumber: pal.d,
        isVariant: Boolean(pal.v),
        rarity: pal.r,
        breedingPower: pal.pw,
        sortOrder: pal.pr,
        image: `${ICON_BASE_URL}${pal.s}.webp`,
        elements: [],
        breedable: true,
      },
    ]),
  );
  const childByParentPair = {};
  const parentPairsByChild = Object.fromEntries(palIds.map((palId) => [palId, []]));
  const partnerIdsByParentAndChild = Object.fromEntries(palIds.map((palId) => [palId, {}]));
  const genderedChildrenByParentPair = {};
  const genderedRules = raw.gendered.map((rule) => ({
    firstParentId: palIds[rule.a],
    firstParentGender: rule.ag,
    secondParentId: palIds[rule.b],
    secondParentGender: rule.bg,
    childId: palIds[rule.c],
  }));

  let deterministicPairCount = 0;
  let genderedPairCount = 0;
  let unavailablePairCount = 0;

  for (let firstIndex = 0; firstIndex < palIds.length; firstIndex += 1) {
    for (let secondIndex = firstIndex; secondIndex < palIds.length; secondIndex += 1) {
      const codeOffset = (secondIndex - firstIndex) * 2;
      const code = raw.matrix[firstIndex].slice(codeOffset, codeOffset + 2);
      const firstId = palIds[firstIndex];
      const secondId = palIds[secondIndex];
      const key = pairKey(firstId, secondId);

      if (code === "--") {
        unavailablePairCount += 1;
        continue;
      }

      if (code === "zz") {
        const matchingRules = genderedRules.filter(
          (rule) => pairKey(rule.firstParentId, rule.secondParentId) === key,
        );
        if (matchingRules.length === 0) throw new Error(`Missing gender rule for ${key}.`);

        genderedChildrenByParentPair[key] = [...new Set(matchingRules.map((rule) => rule.childId))].sort();
        for (const childId of genderedChildrenByParentPair[key]) {
          addReverseIndexes(firstId, secondId, childId, parentPairsByChild, partnerIdsByParentAndChild);
        }
        genderedPairCount += 1;
        continue;
      }

      const childIndex = decodeBase36Pair(code);
      const childId = palIds[childIndex];
      if (!childId) throw new Error(`Pair ${key} resolves to unknown Pal index ${childIndex}.`);
      if (childByParentPair[key]) throw new Error(`Duplicate deterministic pair ${key}.`);

      childByParentPair[key] = childId;
      addReverseIndexes(firstId, secondId, childId, parentPairsByChild, partnerIdsByParentAndChild);
      deterministicPairCount += 1;
    }
  }

  sortIndexes(parentPairsByChild, partnerIdsByParentAndChild);
  validateGeneratedIndexes({
    palsById,
    childByParentPair,
    parentPairsByChild,
    partnerIdsByParentAndChild,
    genderedChildrenByParentPair,
    genderedRules,
  });

  return {
    metadata: {
      gameVersion: raw.version,
      sourceUrl,
      sourceAttribution: raw.source,
      imageBaseUrl: ICON_BASE_URL,
      sourceUpdatedAt: raw.updated,
      retrievedAt: new Date().toISOString().slice(0, 10),
      license: "palcalc db v26 (MIT); Palworld data belongs to Pocketpair",
      sourceContentSha256: createHash("sha256").update(sourceText).digest("hex"),
      palCount: palIds.length,
      parentPairCount: deterministicPairCount + genderedPairCount,
      deterministicPairCount,
      genderedPairCount,
      unavailablePairCount,
    },
    palsById,
    childByParentPair,
    parentPairsByChild,
    partnerIdsByParentAndChild,
    genderedChildrenByParentPair,
    genderedRules,
  };
}

function buildRuntimeArtifact(raw, artifact) {
  return {
    metadata: {
      gameVersion: artifact.metadata.gameVersion,
      imageBaseUrl: artifact.metadata.imageBaseUrl,
      palCount: artifact.metadata.palCount,
      parentPairCount: artifact.metadata.parentPairCount,
    },
    pals: raw.pals.map((pal) => ({
      id: pal.s,
      name: pal.n,
    })),
    matrix: raw.matrix,
    genderedRules: artifact.genderedRules,
  };
}

function validateRawData(raw) {
  if (raw.version !== "1.0") throw new Error(`Expected game data 1.0, received ${raw.version}.`);
  if (!Array.isArray(raw.pals) || raw.pals.length === 0) throw new Error("Source has no Pals.");
  if (!Array.isArray(raw.matrix) || raw.matrix.length !== raw.pals.length) {
    throw new Error("Breeding matrix size does not match the Pal list.");
  }
  if (!Array.isArray(raw.gendered)) throw new Error("Source gender rules are missing.");

  const ids = raw.pals.map((pal) => pal.s);
  if (new Set(ids).size !== ids.length) throw new Error("Source contains duplicate Pal IDs.");
  raw.matrix.forEach((row, index) => {
    const expectedLength = (raw.pals.length - index) * 2;
    if (row.length !== expectedLength) {
      throw new Error(`Matrix row ${index} has length ${row.length}; expected ${expectedLength}.`);
    }
  });
  raw.gendered.forEach((rule, index) => {
    for (const palIndex of [rule.a, rule.b, rule.c]) {
      if (!Number.isInteger(palIndex) || !raw.pals[palIndex]) {
        throw new Error(`Gender rule ${index} contains unknown Pal index ${palIndex}.`);
      }
    }
  });
}

function addReverseIndexes(firstId, secondId, childId, parentPairsByChild, partnerIdsByParentAndChild) {
  const pair = [firstId, secondId].sort();
  if (!parentPairsByChild[childId].some((candidate) => candidate[0] === pair[0] && candidate[1] === pair[1])) {
    parentPairsByChild[childId].push(pair);
  }

  addPartner(partnerIdsByParentAndChild, firstId, childId, secondId);
  addPartner(partnerIdsByParentAndChild, secondId, childId, firstId);
}

function addPartner(index, parentId, childId, partnerId) {
  index[parentId][childId] ??= [];
  if (!index[parentId][childId].includes(partnerId)) index[parentId][childId].push(partnerId);
}

function sortIndexes(parentPairsByChild, partnerIdsByParentAndChild) {
  for (const pairs of Object.values(parentPairsByChild)) {
    pairs.sort((left, right) => pairKey(...left).localeCompare(pairKey(...right)));
  }
  for (const byChild of Object.values(partnerIdsByParentAndChild)) {
    for (const partners of Object.values(byChild)) partners.sort();
  }
}

function validateGeneratedIndexes(indexes) {
  const knownIds = new Set(Object.keys(indexes.palsById));

  for (const [key, childId] of Object.entries(indexes.childByParentPair)) {
    const pair = key.split("|");
    assertKnownIds([...pair, childId], knownIds, key);
    assertReverseIndexes(pair, childId, indexes, key);
  }
  for (const [key, childIds] of Object.entries(indexes.genderedChildrenByParentPair)) {
    const pair = key.split("|");
    for (const childId of childIds) {
      assertKnownIds([...pair, childId], knownIds, key);
      assertReverseIndexes(pair, childId, indexes, key);
    }
  }

  const goldenPairs = {
    "lamball|lamball": "lamball",
    "mossanda|petallia": "valentail",
    "grizzbolt|relaxaurus": "reptyro",
  };
  for (const [key, expectedChild] of Object.entries(goldenPairs)) {
    if (indexes.childByParentPair[key] !== expectedChild) {
      throw new Error(`Golden pair ${key} should produce ${expectedChild}, not ${indexes.childByParentPair[key]}.`);
    }
  }

  const expectedGenderedChildren = indexes.genderedChildrenByParentPair["katress|wixen"];
  if (expectedGenderedChildren?.join("|") !== "katress-ignis|wixen-noct") {
    throw new Error("Katress/Wixen gender-specific outcomes are incomplete.");
  }
}

function assertReverseIndexes(pair, childId, indexes, key) {
  const reversePairs = indexes.parentPairsByChild[childId];
  if (!reversePairs.some((candidate) => candidate[0] === pair[0] && candidate[1] === pair[1])) {
    throw new Error(`Reverse parent-pair index is missing ${key} -> ${childId}.`);
  }
  if (!indexes.partnerIdsByParentAndChild[pair[0]][childId]?.includes(pair[1])) {
    throw new Error(`Partner index is missing ${pair[0]} + ${pair[1]} -> ${childId}.`);
  }
  if (!indexes.partnerIdsByParentAndChild[pair[1]][childId]?.includes(pair[0])) {
    throw new Error(`Partner index is missing ${pair[1]} + ${pair[0]} -> ${childId}.`);
  }
}

function assertKnownIds(ids, knownIds, context) {
  for (const id of ids) {
    if (!knownIds.has(id)) throw new Error(`${context} references unknown Pal ID ${id}.`);
  }
}

function decodeBase36Pair(code) {
  const high = BASE36.indexOf(code[0]);
  const low = BASE36.indexOf(code[1]);
  if (high < 0 || low < 0) throw new Error(`Invalid matrix code ${code}.`);
  return high * 36 + low;
}

function pairKey(firstId, secondId) {
  return [firstId, secondId].sort().join("|");
}

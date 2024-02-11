import fs from "fs";
import { promises as fsPromises } from "fs";

var uniqueCombosMap;
var palData,
  picData,
  gennedData,
  palDex = [];

const readJsonFile = async (filePath) => {
  try {
    const fileContent = await fsPromises.readFile(filePath, "utf-8");
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading JSON file ${filePath}:`, error);
    return null;
  }
};

const createUniqueCombosMap = (uniqueCombos) =>
  new Map(
    Object.entries(uniqueCombos).map(([output, combo]) => [
      output,
      new Set(combo.map((d) => d.toLowerCase())),
    ])
  );

const getUniqueChild = (pal1, pal2) => {
  const match = Array.from(uniqueCombosMap.entries()).find(
    ([output, combo]) => {
      return (
        combo.has(pal1.name.toLowerCase()) && combo.has(pal2.name.toLowerCase())
      );
    }
  );
  return match
    ? { [match[0]]: palData.filter((pal) => pal.name === match[0]) }
    : null;
};

const getChild = (pal1, pal2) => {
  const uniqueMatch = getUniqueChild(pal1, pal2);

  if (pal1.name === pal2.name) {
    return palData.find((p) => p.name === pal1.name);
  }

  if (uniqueMatch) {
    return uniqueMatch[Object.keys(uniqueMatch)[0]][0];
  }

  const breedAverage = (pal1.combirank + pal2.combirank) / 2;

  const childCandidates = palData.filter(
    (candidate) => !uniqueCombosMap.has(candidate.name)
  );

  const closestPal = childCandidates.reduce((prev, current) => {
    if (!prev) {
      return current;
    }

    const prevDifference = Math.abs(prev.combirank - breedAverage);
    const currentDifference = Math.abs(current.combirank - breedAverage);

    if (
      currentDifference < prevDifference ||
      (currentDifference === prevDifference &&
        current.indexorder < prev.indexorder)
    ) {
      return current;
    }

    return prev;
  }, null);

  return closestPal;
};

const buildData = async () => {
  try {
    const output = {
      palDex: {}, //name => data
      breedingLookup: {}, //schema name|name => child, names sorted alphabetically
      potentialParents: {}, //schema parent|child => list of available partners to produce
      parentMatches: {}, //child => list of available parents to produce
    };

    for (let pal of palData) {
      const palMatch = picData.find((pal2) => pal2.name === pal.name);
      output.palDex[pal.name] = { ...pal, image: palMatch.imageUrl };
    }

    for (let pal of palData) {
      for (let mate of palData) {
        const child = getChild(pal, mate);
        if (child) {
          //step: buil schema keys
          const pair = [pal.name, mate.name].sort();
          const breedingLookupKey = pair.join("|");
          const potentialParentsKeyOne = [pal.name, child.name].join("|");
          const potentialParentsKeyTwo = [mate.name, child.name].join("|");

          //Step: breeding lookup key
          output.breedingLookup[breedingLookupKey] = child.name;

          //populate potentialParents map
          if (!output.potentialParents[potentialParentsKeyOne]) {
            output.potentialParents[potentialParentsKeyOne] = [];
          }
          if (
            !output.potentialParents[potentialParentsKeyOne].includes(mate.name)
          ) {
            output.potentialParents[potentialParentsKeyOne].push(mate.name);
          }
          if (!output.potentialParents[potentialParentsKeyTwo]) {
            output.potentialParents[potentialParentsKeyTwo] = [];
          }
          if (
            !output.potentialParents[potentialParentsKeyTwo].includes(pal.name)
          ) {
            output.potentialParents[potentialParentsKeyTwo].push(pal.name);
          }

          //populate parent matches map
          if (!output.parentMatches[child.name]) {
            output.parentMatches[child.name] = [];
          }
          if (
            output.parentMatches[child.name].filter(
              (combo) => combo.join("|") === breedingLookupKey
            ).length === 0
          ) {
            output.parentMatches[child.name].push(pair);
          }
        }
      }
    }

    return output;
  } catch (error) {
    console.error("Error building data:", error);
    return null;
  }
};

async function run() {
  try {
    const output = await buildData();

    const content = JSON.stringify(output, null, 2);

    fsPromises.writeFile(process.cwd() + "/output.json", content);

    console.log("File written successfully!");

    return output;
  } catch (err) {
    console.error("Error writing file:", err);
  }
}

async function test(data) {
  const { palDex, breedingLookup, potentialParents, parentMatches } = data;

  const testParent1 = palDex["Jetragon"];
  const testParent2 = palDex["Direhowl"];

  const test2 = getChild(testParent1, testParent2);

  console.log({
    parent1: testParent1.name,
    parent2: testParent2.name,
    outcome: test2.name,
  });
}

async function main() {
  palData = await readJsonFile("./dataIn/palData.json");
  picData = await readJsonFile("./dataIn/pics.json");
  uniqueCombosMap = createUniqueCombosMap(
    await readJsonFile("./dataIn/uniqueCombos.json")
  );
  const output = await run();
  await test(output);
}

main();

/*
  Creates directed acyclic graph using BFS to find the shortest path from pal A to pal B
    previous node in tree contains the the current pal in the parent options array
    parentMatches is data structure as follows:
    {
      "Blazamut": [["Suzaku Aqua", "Blazamut"], ["Blazamut", "Blazamut"]],
      ...
    }
    Each key is pal name, contains list of parent combinations. Saves time having to calculate each pal combo in BFS
*/
import { palDex, parentMatches } from "../data/data.json";

type PalDex = typeof palDex;
type Pal = PalDex[keyof PalDex];
type PalName = Pal["name"] & keyof typeof palDex & string & keyof typeof parentMatches;
type PalNode = {
  pal: string;
  breedingOptions: string[] | null;
  next: PalNode | null;
};

function getParentMatches(palName: string | PalName) {
  return parentMatches[palName as PalName] || null;
}

function getOtherParents(parents: string[][], param: string) {
  const results = parents.map((arr) => {
    const uniqueValues = [...new Set(arr)];
    return uniqueValues.find((value) => value !== param) || uniqueValues[0];
  });
  return [...new Set(results.flat())] as PalName[];
}

function findShortestLineage(targetPal: Pal, parentPal: Pal): PalNode | null {
  const queue: PalNode[] = [
    {
      pal: parentPal.name,
      breedingOptions: null,
      next: null,
    },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentNode = queue.shift()!;
    visited.add(currentNode.pal);

    const potentialParents = getParentMatches(currentNode.pal);
    const parentMatches = potentialParents.filter((p) => p.includes(targetPal.name));

    if (parentMatches.length > 0) {
      //Not sure why the last nodes parents are null. added this in as temp fix while i look into
      //only happens if depth > 2
      let lastNode = { ...currentNode };
      let prevNode: PalNode | null = null;
      while (lastNode.next !== null) {
        prevNode = lastNode;
        lastNode = lastNode.next;
      }
      if (lastNode && prevNode) {
        const lastNodeParents = getParentMatches(lastNode.pal).filter((p) => p.includes(prevNode!!.pal));
        lastNode.breedingOptions = getOtherParents(lastNodeParents, prevNode.pal);
      }
      //
      currentNode.breedingOptions = getOtherParents(parentMatches, targetPal.name);
      return currentNode;
    }

    const nextParentsToCheck = potentialParents.flatMap((p) => p).filter((p) => !visited.has(p));
    for (const parent of nextParentsToCheck) {
      const parentPal = getPalByName(parent);
      if (parentPal !== null) {
        queue.push({
          pal: parentPal.name,
          breedingOptions: [currentNode.pal],
          next: currentNode,
        });
      }
    }
  }

  return null;
}

function getBreedingPath(targetPal: Pal, parentPal: Pal) {
  let path = findShortestLineage(targetPal, parentPal);
  console.log({ path });
  let pathArray = [];
  while (path) {
    pathArray.push({
      pal: path.pal,
      breedingOptions: path.breedingOptions,
    });
    path = path.next;
  }
  return pathArray;
}

const getPalByName = (palName: string | PalName) => palDex[palName as PalName] || null;

export { getPalByName, getBreedingPath };
  export type { Pal, PalDex, PalName };

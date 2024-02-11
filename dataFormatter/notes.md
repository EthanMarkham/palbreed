# PalDex Data Structure Documentation

The provided JavaScript code defines a data structure called `output`, which represents a PalDex (a database of creatures) with additional information for breeding and parent-child relationships. This documentation outlines the structure and purpose of the generated data.

## `output` Object

### `palDex` (Object)

* **Key:** Pal name
* **Value:** Object containing pal information, including an additional `image` property.

### `breedingLookup` (Object)

* **Key:** String representing a pair of parent names sorted alphabetically and joined by a pipe (`|`) character.
* **Value:** String representing the name of the child resulting from the breeding.

### `potentialParents` (Object)

* **Key:** String representing a pair of parent and child names joined by a pipe (`|`) character.
* **Value:** Array of names representing potential partners to produce the specified child. Sorted alphabetically.

### `parentMatches` (Object)

* **Key:** String representing the name of the child.
* **Value:** Array of pairs of parent names (sorted alphabetically and joined by a pipe (`|`) character) that can produce the specified child.

## Usage


1. **PalDex Information (**`palDex`): Provides detailed information about each pal, including an associated image.
2. **Breeding Lookup (**`breedingLookup`): Maps pairs of parent names to the resulting child's name. Used for quick reference during breeding simulations.
3. **Potential Parents (**`potentialParents`): Maps pairs of parent and child names to a list of potential partners to produce the specified child. Facilitates the identification of suitable mates.
4. **Parent Matches (**`parentMatches`): Maps child names to an array of pairs of parent names that can produce the specified child. Helps identify potential parent combinations for a specific child.

## Example

```json
{
  "palDex": {
    "Pal1": { "name": "Pal1", "image": "url1", ... },
    "Pal2": { "name": "Pal2", "image": "url2", ... },
    ...
  },
  "breedingLookup": {
    "Pal1|Pal2": "Child1",
    "Pal3|Pal4": "Child2",
    ...
  },
  "potentialParents": {
    "Pal1|Child1": ["Pal3", "Pal4"],
    "Pal2|Child1": ["Pal5", "Pal6"],
    ...
  },
  "parentMatches": {
    "Child1": [["Pal1|Pal2"], ["Pal3|Pal4"], ...],
    "Child2": [["Pal3|Pal4"], ["Pal7|Pal8"], ...],
    ...
  }
}
```

This data structure facilitates efficient retrieval of information related to pal details, breeding outcomes, potential parents, and parent-child matches for a comprehensive PalDex experience.
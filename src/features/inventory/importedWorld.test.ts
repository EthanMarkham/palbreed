import { describe, expect, it } from "vitest";
import { describeImportedWorld } from "./importedWorld";

describe("imported world presentation", () => {
  it("uses the sole player's name and level", () => {
    expect(describeImportedWorld("World 1", [{ id: "player-1", name: "Ethan", level: 65 }])).toEqual({
      name: "Ethan · Level 65",
      player: { id: "player-1", name: "Ethan", level: 65 },
    });
  });

  it("does not attribute a multiplayer world to an arbitrary player", () => {
    expect(describeImportedWorld("World 1", [
      { id: "player-1", name: "Ethan", level: 65 },
      { id: "player-2", name: "Mark", level: 64 },
    ])).toEqual({ name: "World 1", player: undefined });
  });
});

import { describe, expect, it } from "vitest";
import { passiveRepository } from "../data/passiveRepository";
import {
  runBuilderSearch,
  setBuilderAnyPassives,
  setBuilderPassiveQuery,
  setBuilderPassives,
} from "./builder/builderNavigation";
import { getBuilderPassiveIds, parseBuilderSearch } from "./builder/builderSearch";
import {
  parseInventorySearch,
  setInventoryQuery,
  setInventoryWorld,
} from "./inventory/inventorySearch";
import {
  parseToolsSearch,
  setToolsInput,
  setToolsSelection,
  swapToolsSelections,
} from "./tools/toolsSearch";
import {
  compactSearch,
  normalizePalSearch,
  normalizeSearchQuery,
  shouldReplaceSearch,
} from "../routing/searchParams";

describe("route-backed search state", () => {
  it("applies the shared URL-state conventions", () => {
    expect(normalizeSearchQuery("work speed ")).toBe("work speed ");
    expect(normalizeSearchQuery("   ")).toBeUndefined();
    expect(normalizePalSearch("lamball", "Lamball")).toEqual({ selectedId: "lamball" });
    expect(normalizePalSearch("lamball", "Cattiva")).toEqual({ query: "Cattiva" });
    expect(compactSearch({ target: "lamball", query: undefined })).toEqual({ target: "lamball" });
    expect(shouldReplaceSearch("replace")).toBe(true);
    expect(shouldReplaceSearch("push")).toBe(false);
  });

  it("validates and normalizes the Builder URL contract", () => {
    const passiveIds = passiveRepository.all().slice(0, 5).map(({ id }) => id);
    const search = parseBuilderSearch({
      target: "lamball",
      passives: [...passiveIds, passiveIds[0], "not-a-passive"],
      passiveQuery: "work speed",
      objective: "cleanest",
      extras: "2",
      run: "1",
    });

    expect(search).toMatchObject({
      target: "lamball",
      passiveQuery: "work speed",
      objective: "cleanest",
      extras: 2,
      run: true,
    });
    expect(getBuilderPassiveIds(search)).toEqual(passiveIds.slice(0, 4));
    expect(parseBuilderSearch({ passives: "any", run: true })).toEqual({ passives: "any", run: true });
    expect(parseBuilderSearch({ passives: [`${passiveIds[0]},${passiveIds[1]}`, passiveIds[2]] })).toEqual({
      passives: passiveIds.slice(0, 3).join(","),
    });
  });

  it("keeps multi-word passive typing usable and clears stale Builder results", () => {
    const passiveId = passiveRepository.all()[0].id;
    const running = runBuilderSearch({ target: "lamball" });
    const typed = setBuilderPassiveQuery(running, "work speed ");

    expect(typed.passiveQuery).toBe("work speed ");
    expect(setBuilderPassives(typed, [passiveId])).toEqual({
      target: "lamball",
      passives: passiveId,
    });
    expect(setBuilderAnyPassives(typed, true)).toEqual({
      target: "lamball",
      passives: "any",
    });
  });

  it("keeps both condensed tools serializable in one route", () => {
    const parsed = parseToolsSearch({ first: "lamball", firstQuery: "Cattiva", from: "cattiva" });
    expect(parsed).toEqual({ from: "cattiva", firstQuery: "Cattiva" });

    const selected = setToolsSelection(parsed, "first", "lamball");
    expect(selected).toEqual({ from: "cattiva", first: "lamball" });
    expect(setToolsInput(selected, "to", "Daedream ")).toEqual({
      from: "cattiva",
      toQuery: "Daedream ",
      first: "lamball",
    });
    expect(swapToolsSelections({ first: "lamball", second: "cattiva" }, "parents")).toEqual({
      first: "cattiva",
      second: "lamball",
    });
  });

  it("keeps Inventory world selection and filtering in browser history", () => {
    expect(parseInventorySearch({ world: " world-1 ", q: "Lamball " })).toEqual({
      world: "world-1",
      q: "Lamball ",
    });
    expect(parseInventorySearch({ world: 12, q: "   " })).toEqual({});
    expect(setInventoryWorld({ q: "swift" }, "world-2")).toEqual({
      world: "world-2",
      q: "swift",
    });
    expect(setInventoryQuery({ world: "world-2", q: "old" }, "")).toEqual({
      world: "world-2",
    });
  });
});

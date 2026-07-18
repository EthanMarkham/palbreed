import { describe, expect, it } from "vitest";
import { passiveRepository } from "../data/passiveRepository";
import {
  runBuilderSearch,
  setBuilderPassiveQuery,
  setBuilderPassives,
} from "./builder/builderNavigation";
import { getBuilderPassiveIds, parseBuilderSearch } from "./builder/builderSearch";
import {
  parseInventorySearch,
  setInventoryPlatform,
  setInventoryTarget,
  setInventoryTargetInput,
} from "./inventory/inventorySearch";
import { setPairSelection, swapPairSearch } from "./pair/pairNavigation";
import { parsePairSearch } from "./pair/pairSearch";
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
      gender: "M",
    });

    expect(search).toMatchObject({
      target: "lamball",
      passiveQuery: "work speed",
      objective: "cleanest",
      extras: 2,
      run: true,
      gender: "M",
    });
    expect(getBuilderPassiveIds(search)).toEqual(passiveIds.slice(0, 4));
  });

  it("keeps multi-word passive typing usable and clears stale Builder results", () => {
    const passiveId = passiveRepository.all()[0].id;
    const running = runBuilderSearch({ target: "lamball" });
    const typed = setBuilderPassiveQuery(running, "work speed ");

    expect(typed.passiveQuery).toBe("work speed ");
    expect(setBuilderPassives(typed, [passiveId])).toEqual({
      target: "lamball",
      passiveQuery: "work speed ",
      passives: passiveId,
    });
  });

  it("makes Pair selections and swaps serializable", () => {
    const parsed = parsePairSearch({ first: "lamball", firstQuery: "Cattiva" });
    expect(parsed).toEqual({ firstQuery: "Cattiva" });

    const selected = setPairSelection(parsed, "first", "lamball");
    expect(selected).toEqual({ first: "lamball" });
    expect(swapPairSearch({ first: "lamball", second: "cattiva" })).toEqual({
      first: "cattiva",
      second: "lamball",
    });
  });

  it("normalizes Inventory platform and target state for browser history", () => {
    expect(parseInventorySearch({ platform: "steam", target: "missing" })).toEqual({ platform: "steam" });

    const steam = setInventoryPlatform({}, "steam");
    const typing = setInventoryTargetInput(steam, "Relaxaurus Lux ");
    expect(typing).toEqual({ platform: "steam", targetQuery: "Relaxaurus Lux " });
    expect(setInventoryTarget(typing, "relaxaurus-lux")).toEqual({
      platform: "steam",
      target: "relaxaurus-lux",
    });
  });
});

import { describe, expect, test } from "bun:test";
import { clockTime, durationShare, formatDuration, middleTruncate, relativeTime } from "./format";
import { filterTree, highlightParts } from "./tree-filter";
import { entityIndex, navigationCounts, searchEntities } from "./graph-index";
import type { GraphNode, GraphSnapshot } from "./graph-model";
import { sparklinePoints } from "../components/blocks/stat";

describe("format", () => {
  test("durations pick a readable unit", () => {
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(2.44)).toBe("2.4 ms");
    expect(formatDuration(184.4)).toBe("184 ms");
    expect(formatDuration(1320)).toBe("1.32 s");
    expect(formatDuration(12_500)).toBe("12.5 s");
    expect(formatDuration(125_000)).toBe("2m 05s");
  });

  test("relative time counts back from now and never goes negative", () => {
    const now = Date.parse("2026-11-01T12:00:00.000Z");
    expect(relativeTime(undefined, now)).toBe("—");
    expect(relativeTime("not a date", now)).toBe("—");
    expect(relativeTime("2026-11-01T12:00:03.000Z", now)).toBe("just now");
    expect(relativeTime("2026-11-01T11:59:18.000Z", now)).toBe("42s ago");
    expect(relativeTime("2026-11-01T11:57:00.000Z", now)).toBe("3m ago");
    expect(relativeTime("2026-11-01T07:00:00.000Z", now)).toBe("5h ago");
    expect(relativeTime("2026-10-29T12:00:00.000Z", now)).toBe("3d ago");
  });

  test("clock time keeps milliseconds and tolerates bad input", () => {
    expect(clockTime(undefined)).toBe("—");
    expect(clockTime("2026-11-01T12:00:00.123Z")).toMatch(/\d{2}:\d{2}:\d{2}\.123/);
  });

  test("duration bars scale to the slowest item with a visible floor", () => {
    expect(durationShare(undefined, 100)).toBe(0);
    expect(durationShare(10, 0)).toBe(0);
    expect(durationShare(50, 100)).toBe(50);
    expect(durationShare(0.1, 100)).toBe(2);
    expect(durationShare(500, 100)).toBe(100);
  });

  test("middle truncation keeps both ends", () => {
    expect(middleTruncate("short")).toBe("short");
    const value = middleTruncate("sha256:cb4188181b0f47f75e4f1b550e6b55339639", 16);
    expect(value).toHaveLength(16);
    expect(value.startsWith("sha256:c")).toBe(true);
    expect(value.endsWith("639")).toBe(true);
  });
});

describe("tree filter", () => {
  const groups = [
    {
      id: "fleet",
      label: "fleet",
      children: [
        { id: "route.get.cars", label: "GET /cars" },
        { id: "fleet.list-cars", label: "list cars", keywords: "function" },
      ],
    },
    { id: "billing", label: "billing", children: [{ id: "billing.charge", label: "charge" }] },
  ];

  test("an empty query keeps every group closed", () => {
    const result = filterTree(groups, "  ");
    expect(result.map((item) => item.group.id)).toEqual(["fleet", "billing"]);
    expect(result.every((item) => !item.matchedInside)).toBe(true);
  });

  test("a group-label match keeps all of its leaves", () => {
    const result = filterTree(groups, "BILL");
    expect(result).toHaveLength(1);
    expect(result[0]!.children).toHaveLength(1);
    expect(result[0]!.matchedInside).toBe(false);
  });

  test("leaf matches open the group and keep only matching leaves (keywords and ids count)", () => {
    const result = filterTree(groups, "function");
    expect(result).toHaveLength(1);
    expect(result[0]!.matchedInside).toBe(true);
    expect(result[0]!.children.map((leaf) => leaf.id)).toEqual(["fleet.list-cars"]);
    expect(filterTree(groups, "route.get")[0]!.children.map((leaf) => leaf.id)).toEqual([
      "route.get.cars",
    ]);
  });

  test("highlight splits around every case-insensitive match", () => {
    expect(highlightParts("GET /cars/cars", "CARS")).toEqual([
      { text: "GET /", match: false },
      { text: "cars", match: true },
      { text: "/", match: false },
      { text: "cars", match: true },
    ]);
    expect(highlightParts("plain", "")).toEqual([{ text: "plain", match: false }]);
  });
});

describe("graph index", () => {
  const node = (value: Partial<GraphNode> & Pick<GraphNode, "id" | "kind">): GraphNode => value;
  const graph: GraphSnapshot = {
    generationId: "generation-2",
    graphHash: "sha256:abc",
    integrations: [],
    declaredEdges: [],
    observedEdges: [],
    nodes: [
      node({
        id: "route.get.cars",
        kind: "trigger",
        domainId: "fleet",
        meta: { triggerType: "http", config: { method: "GET", path: "/cars" } },
      }),
      node({
        id: "listener.on-car",
        kind: "trigger",
        domainId: "fleet",
        meta: { triggerType: "event" },
      }),
      node({ id: "fleet.list-cars", kind: "function", domainId: "fleet" }),
      node({ id: "billing.charge", kind: "function", domainId: "billing" }),
      node({ id: "support.assistant", kind: "agent", domainId: "support" }),
      node({ id: "app", kind: "app" }),
    ],
  };

  test("counts entities per destination and distinct domains", () => {
    expect(navigationCounts(undefined)).toEqual({});
    expect(navigationCounts(graph)).toEqual({
      "/routes": 1,
      "/events": 1,
      "/functions": 2,
      "/agents": 1,
      "/domains": 3,
    });
  });

  test("indexes detail pages, keeping listeners on their list page", () => {
    const index = entityIndex(graph);
    expect(index.find((entry) => entry.id === "fleet.list-cars")?.href).toBe(
      "/functions/fleet.list-cars",
    );
    expect(index.find((entry) => entry.id === "listener.on-car")?.href).toBe("/events");
    expect(index.some((entry) => entry.id === "app")).toBe(false);
  });

  test("search requires every word and honours the limit", () => {
    const index = entityIndex(graph);
    expect(searchEntities(index, "")).toEqual([]);
    expect(searchEntities(index, "fleet list-cars").map((entry) => entry.id)).toEqual([
      "fleet.list-cars",
    ]);
    expect(searchEntities(index, "function", 1)).toHaveLength(1);
  });
});

describe("sparkline", () => {
  test("scales points into the box and centres a flat series", () => {
    expect(sparklinePoints([], 10, 10)).toBe("");
    expect(sparklinePoints([5, 5], 10, 10)).toBe("0,5 10,5");
    expect(sparklinePoints([0, 10], 10, 10)).toBe("0,9 10,1");
  });
});

import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { categoryForEffect, changedFieldsEffect, nodeKeyEffect } from "../src/diff-utils.js";
import { classifyChangeEffect } from "../src/diff-classification.js";
import type { GraphDiffCategory, GraphDiffClassification } from "../src/diff-types.types.js";
import type { GraphNode } from "../src/index.js";
import { functionNode, source } from "./graph-fixtures.js";
const before = functionNode({
  input: { type: "object", required: ["id"] },
}) as unknown as GraphNode;
const after = functionNode({
  input: { type: "object", required: ["id", "name"] },
}) as unknown as GraphNode;
function classification(
  category: GraphDiffCategory,
  fields: readonly string[],
  left: GraphNode = before,
  right: GraphNode = after,
): GraphDiffClassification {
  return Effect.runSync(classifyChangeEffect(category, "changed", fields, left, right));
}
describe("graph diff classification Effects", () => {
  test("classifies additions, removals, and source moves", () => {
    expect(Effect.runSync(classifyChangeEffect("route", "added", [], undefined, after))).toBe(
      "compatible",
    );
    expect(Effect.runSync(classifyChangeEffect("route", "removed", [], before, undefined))).toBe(
      "breaking",
    );
    expect(
      Effect.runSync(classifyChangeEffect("route", "source-moved", ["source"], before, after)),
    ).toBe("informational");
  });
  test.each([
    ["route", ["config"], "breaking"],
    ["function/error", ["output"], "breaking"],
    ["function/error", ["errors"], "breaking"],
    ["function/error", ["input"], "breaking"],
    ["function/error", ["description"], "potentially-breaking"],
    ["event", ["input"], "breaking"],
    ["job", ["input"], "breaking"],
    ["job", ["retry"], "potentially-breaking"],
    ["bucket/cache", ["visibility"], "breaking"],
    ["bucket/cache", ["profile"], "potentially-breaking"],
    ["bucket/cache", ["defaultTtlMs"], "potentially-breaking"],
    ["tool", ["targetFunctionId"], "breaking"],
    ["tool", ["approval"], "potentially-breaking"],
    ["tool", ["description"], "compatible"],
    ["agent", ["input"], "breaking"],
    ["agent", ["model"], "potentially-breaking"],
    ["service", ["functions"], "breaking"],
    ["service", ["capability"], "potentially-breaking"],
    ["service", ["title"], "compatible"],
    ["profile", ["adapter"], "potentially-breaking"],
  ] as const)("classifies %s %j as %s", (category, fields, expected) => {
    expect(classification(category, fields)).toBe(expected);
  });
  test("treats optional input additions and unknown schema shapes conservatively", () => {
    const optional = functionNode({
      input: { type: "object", required: ["id"] },
    }) as unknown as GraphNode;
    expect(classification("function/error", ["input"], before, optional)).toBe(
      "potentially-breaking",
    );
    const nonObject = functionNode({ input: { type: "string" } }) as unknown as GraphNode;
    expect(classification("function/error", ["input"], before, nonObject)).toBe(
      "potentially-breaking",
    );
    const oldCache = {
      kind: "cache",
      id: "orders.cache",
      source,
      key: {},
      value: {},
      profile: "default",
    } as unknown as GraphNode;
    const newCache = { ...oldCache, defaultTtlMs: 100 } as GraphNode;
    expect(classification("bucket/cache", ["defaultTtlMs"], oldCache, newCache)).toBe("breaking");
  });
  test("categorizes nodes and reports changed top-level fields", () => {
    const route = {
      kind: "trigger",
      id: "orders.route",
      source,
      triggerType: "http",
      targetFunctionId: "orders.create",
      config: {},
    } as unknown as GraphNode;
    expect(Effect.runSync(categoryForEffect(route))).toBe("route");
    expect(Effect.runSync(nodeKeyEffect(route))).toBe("route\0orders.route");
    expect(Effect.runSync(changedFieldsEffect({ a: 1, b: 2 }, { a: 1, b: 3 }))).toEqual(["b"]);
    expect(Effect.runSync(changedFieldsEffect(1, 2))).toEqual(["value"]);
    expect(Effect.runSync(changedFieldsEffect({ bad: undefined } as never, { bad: 1 }))).toEqual([
      "bad",
    ]);
    const unknown = { kind: "app", id: "orders", source } as GraphNode;
    expect(Effect.runSync(categoryForEffect(unknown))).toBeUndefined();
    const queue = { ...route, triggerType: "queue" } as GraphNode;
    expect(Effect.runSync(categoryForEffect(queue))).toBe("job");
  });
});

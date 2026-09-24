import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { GraphEventTargetsError } from "../src/event-validation.js";
import { validateEventTargets, validateEventTargetsEffect } from "../src/event-validation.js";
import { functionNode, graph, serviceNode, source } from "./graph-fixtures.js";
const event = {
  kind: "event",
  id: "orders.created",
  source,
  version: 1,
  input: {},
  profile: "default",
};
const handler = functionNode({ id: "orders.react", invocationMode: "event-only" });
const trigger = {
  kind: "trigger",
  id: "orders.listener",
  source,
  triggerType: "event",
  targetFunctionId: "orders.react",
  config: { eventId: "orders.created", eventVersion: 1, delivery: "durable" },
};
function message(nodes: readonly unknown[], edges: readonly unknown[] = []): string {
  const error = Effect.runSync(Effect.flip(validateEventTargetsEffect(graph(nodes, edges))));
  expect(error).toBeInstanceOf(GraphEventTargetsError);
  return error.message;
}
describe("event target validation", () => {
  test("accepts an exact event-only trigger", () => {
    const value = graph([event, handler, trigger]);
    expect(Effect.runSync(validateEventTargetsEffect(value))).toBeUndefined();
    expect(() => validateEventTargets(value)).not.toThrow();
  });
  test.each([
    [{ ...trigger, config: null }, "requires exact eventId"],
    [{ ...trigger, config: { eventId: 3, eventVersion: 1 } }, "requires exact eventId"],
    [
      { ...trigger, config: { eventId: "orders.created", eventVersion: 0 } },
      "requires exact eventId",
    ],
    [{ ...trigger, config: { ...trigger.config, selector: "latest" } }, "requires exact eventId"],
    [{ ...trigger, config: { ...trigger.config, expansion: "all" } }, "requires exact eventId"],
    [{ ...trigger, targetFunctionId: "orders.create" }, "must target an event-only function"],
    [
      { ...trigger, config: { ...trigger.config, eventId: "orders.missing" } },
      "references unknown event",
    ],
    [{ ...trigger, config: { ...trigger.config, eventVersion: 2 } }, "references unknown event"],
  ])("rejects invalid event trigger %#", (candidate, expected) => {
    const nodes = [event, handler, functionNode(), candidate];
    expect(message(nodes)).toContain(expected);
    expect(() => validateEventTargets(graph(nodes))).toThrow(TypeError);
  });
  test("rejects ordinary nodes that target event-only functions", () => {
    const direct = { kind: "tool", id: "orders.tool", source, targetFunctionId: "orders.react" };
    expect(message([handler, direct])).toContain("cannot target event-only");
    expect(
      message([
        handler,
        serviceNode({ functions: [{ name: "react", functionId: "orders.react" }] }),
      ]),
    ).toContain("cannot target event-only");
    expect(
      message([handler, { kind: "agent", id: "orders.agent", source, toolIds: ["orders.react"] }]),
    ).toContain("cannot target event-only");
  });
  test.each(["calls-function", "targets-function", "exposes-function", "exposes-as-tool"])(
    "rejects forged %s edges to event-only functions",
    (kind) => {
      const edge =
        kind === "exposes-as-tool"
          ? { kind, from: "orders.react", to: "orders.tool" }
          : { kind, from: "orders.caller", to: "orders.react" };
      expect(message([handler], [edge])).toContain("cannot target event-only");
    },
  );
});

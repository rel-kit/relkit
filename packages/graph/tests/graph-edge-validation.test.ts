import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { GraphValidationError, validateGraphShapeEffect } from "../src/index.js";
import { functionNode, graph, httpTrigger, source } from "./graph-fixtures.js";
const hook = {
  kind: "hook",
  id: "orders.before",
  source,
  ownerId: "orders.create",
  ownerKind: "function",
  phase: "before",
};
const validHookEdge = {
  kind: "uses-hook",
  from: "orders.create",
  to: "orders.before",
  phase: "before",
};
function message(
  edge: Record<string, unknown>,
  nodes: readonly unknown[] = [functionNode(), hook],
): string {
  const error = Effect.runSync(Effect.flip(validateGraphShapeEffect(graph(nodes, [edge]))));
  expect(error).toBeInstanceOf(GraphValidationError);
  return error.message;
}
describe("declared graph edge validation", () => {
  test("accepts a hook edge whose owner and phase match", () => {
    expect(
      Effect.runSync(validateGraphShapeEffect(graph([functionNode(), hook], [validHookEdge]))),
    ).toBeUndefined();
  });
  test.each([
    [{ ...validHookEdge, kind: "unknown" }, "invalid kind"],
    [{ ...validHookEdge, from: "bad/id" }, ".from is invalid"],
    [{ ...validHookEdge, to: "bad/id" }, ".to is invalid"],
    [
      { kind: "targets-function", from: "orders.route", to: "orders.create", role: "secondary" },
      ".role is invalid",
    ],
    [
      { kind: "targets-task", from: "orders.route", to: "orders.send", role: "secondary" },
      ".role is invalid",
    ],
    [
      {
        kind: "exposes-function",
        from: "orders.service",
        to: "orders.create",
        member: "",
        order: 0,
      },
      ".member is invalid",
    ],
    [
      {
        kind: "exposes-event",
        from: "orders.service",
        to: "orders.created",
        member: "created",
        order: -1,
      },
      ".order is invalid",
    ],
    [
      {
        kind: "uses-middleware",
        from: "orders.route",
        to: "orders.auth",
        order: 0,
        match: "sometimes",
      },
      ".match is invalid",
    ],
    [
      {
        kind: "uses-middleware",
        from: "orders.route",
        to: "orders.auth",
        order: 1.5,
        match: "always",
      },
      ".order is invalid",
    ],
    [{ ...validHookEdge, phase: "other" }, ".phase is invalid"],
    [{ ...validHookEdge, to: "orders.missing" }, ".to must reference a hook"],
    [{ ...validHookEdge, from: "orders.other" }, "must originate at its hook owner"],
    [{ ...validHookEdge, phase: "after" }, ".phase does not match"],
  ])("rejects malformed edge %#", (edge, expected) => {
    expect(message(edge)).toContain(expected);
  });
  test("rejects hook owner kind mismatches and unbound nested identities", () => {
    const taskHook = { ...hook, ownerKind: "task", phase: "start" };
    expect(message({ ...validHookEdge, phase: "start" }, [functionNode(), taskHook])).toContain(
      "owner kind",
    );
    const value = graph([httpTrigger({ config: { metadata: { functionId: "unbound.orders" } } })]);
    const error = Effect.runSync(Effect.flip(validateGraphShapeEffect(value)));
    expect(error.message).toContain("canonical identity");
  });
});

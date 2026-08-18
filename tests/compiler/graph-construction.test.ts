import { describe, expect, test } from "bun:test";
import { defineEvent, events, onEvent } from "../../packages/events/src/index.ts";
import { defineFunction } from "../../packages/functions/src/index.ts";
import {
  defineMiddleware,
  defineRoute,
  defineTransform,
  http,
} from "../../packages/routes/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";

const input = z.object({ id: z.string() });
const output = z.object({ ok: z.boolean() });

describe("compiler graph construction", () => {
  test("projects triggers, ordered middleware/transforms, and declared edges", () => {
    const target = defineFunction({
      id: "orders.get",
      input,
      output,
      dependencies: {
        functions: { helper: { ref: { kind: "function", id: "orders.helper" }, input, output } },
        cache: { prices: { ref: { kind: "cache", id: "prices" }, key: input, value: output } },
      },
      handler: async () => ({ ok: true }),
    });
    const helper = defineFunction({
      id: "orders.helper",
      input,
      output,
      handler: async () => ({ ok: true }),
    });
    const auth = defineFunction({
      id: "orders.auth",
      input,
      output,
      handler: async () => ({ ok: true }),
    });
    const prices = {
      kind: "cache",
      id: "prices",
      ref: { kind: "cache", id: "prices" },
      key: input,
      value: output,
    };
    const transform = defineTransform({ id: "orders.normalize", schema: z.string() });
    const middleware = defineMiddleware({
      id: "orders.middleware",
      target: auth,
      request: http.input({ id: http.header("x-order-id") }),
      decision: http.continue(),
    });
    const route = defineRoute({
      id: "orders.route",
      method: "GET",
      path: "/orders/:id",
      target,
      request: http.input({ id: http.transform(transform, http.path("id")) }),
      responses: [http.success(200, output)],
      middleware: [middleware],
    });
    const first = defineEvent({ id: "orders.created", version: 1, payload: input });
    const second = defineEvent({ id: "orders.updated", version: 2, payload: input });
    const listener = onEvent(events.anyOf(second, first), {
      id: "orders.listener",
      target,
      delivery: "durable",
    });
    const result = normalizeCompilation({
      descriptors: [
        prices,
        helper,
        listener,
        second,
        transform,
        route,
        auth,
        first,
        middleware,
        target,
      ],
      observedEdges: [{ relationship: "uses-cache", from: "orders.get", to: "prices" }],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.observedEdges).toEqual([
      { relationship: "uses-cache", from: "orders.get", to: "prices" },
    ]);
    expect(result.graph).not.toHaveProperty("observedEdges");
    const withoutObserved = normalizeCompilation({
      descriptors: [
        prices,
        helper,
        listener,
        second,
        transform,
        route,
        auth,
        first,
        middleware,
        target,
      ],
    });
    expect(result.graphHash).toBe(withoutObserved.graphHash);
    expect(result.outputs.graph).toBe(withoutObserved.outputs.graph);

    const nodes = result.graph?.nodes ?? [];
    expect(nodes.map((node) => node.kind)).not.toEqual(
      expect.arrayContaining(["route", "event-trigger", "middleware", "transform"]),
    );
    const routeNode = nodes.find((node) => node.id === "orders.route");
    const listenerNode = nodes.find((node) => node.id === "orders.listener");
    expect(routeNode).toMatchObject({ kind: "trigger", triggerType: "http" });
    expect(listenerNode).toMatchObject({ kind: "trigger", triggerType: "event" });
    expect(
      (routeNode?.config as { middleware: unknown[]; transforms: unknown[] }).middleware,
    ).toEqual([{ id: "orders.middleware", targetFunctionId: "orders.auth" }]);
    expect(
      (routeNode?.config as { middleware: unknown[]; transforms: unknown[] }).transforms,
    ).toEqual([expect.objectContaining({ id: "orders.normalize" })]);
    expect((listenerNode?.config as { expansion: readonly string[] }).expansion).toEqual([
      "orders.created@1",
      "orders.updated@2",
    ]);

    expect(result.graph?.edges).toEqual(
      expect.arrayContaining([
        { kind: "targets-function", from: "orders.route", to: "orders.get", role: "primary" },
        { kind: "targets-function", from: "orders.route", to: "orders.auth", role: "middleware" },
        { kind: "targets-function", from: "orders.listener", to: "orders.get", role: "primary" },
        { kind: "listens-to-event", from: "orders.listener", to: "orders.created" },
        { kind: "listens-to-event", from: "orders.listener", to: "orders.updated" },
        { kind: "calls-function", from: "orders.get", to: "orders.helper" },
        { kind: "uses-cache", from: "orders.get", to: "prices" },
      ]),
    );
  });
});

import { describe, expect, test } from "bun:test";
import { defineEvent, events, onEvent } from "../../packages/events/src/index.ts";
import { defineFunction } from "../../packages/functions/src/index.ts";
import { defineService } from "../../packages/services/src/index.ts";
import { defineRoute, defineTransform, http } from "../../packages/routes/src/index.ts";
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
        cache: { prices: { ref: { kind: "cache", id: "prices" }, key: input, value: output } },
      },
      onBefore: async (value) => value,
      onAfter: async (value) => value,
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
    const middleware = {
      kind: "middleware",
      id: "orders.middleware",
      ref: { kind: "middleware", id: "orders.middleware" },
      path: "/orders/*",
      handler: async () => undefined,
    };
    const route = defineRoute({
      id: "orders.route",
      method: "GET",
      path: "/orders/:id",
      target,
      request: http.input({ id: http.transform(transform, http.path("id")) }),
      responses: [http.success(200, output)],
    });
    const first = defineEvent({ id: "orders.created", version: 1, payload: input });
    const second = defineEvent({ id: "orders.updated", version: 2, payload: input });
    const listener = onEvent(
      events.anyOf("orders.updated" as never, "orders.created" as never),
      async () => ({ ok: true }),
      { id: "orders.listener" },
    );
    const service = defineService({
      id: "orders",
      title: "Orders",
      description: "Order operations",
      tags: ["orders"],
      functions: { get: target, helper, authorize: auth },
      middleware: [
        { ref: { kind: "service-middleware", id: "orders.context" } },
        { ref: { kind: "service-middleware", id: "orders.audit" } },
      ],
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
        service,
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
        service,
      ],
    });
    expect(result.graphHash).toBe(withoutObserved.graphHash);
    expect(result.outputs.graph).toBe(withoutObserved.outputs.graph);

    const nodes = result.graph?.nodes ?? [];
    expect(nodes.map((node) => node.kind)).not.toEqual(
      expect.arrayContaining(["route", "event-trigger", "transform"]),
    );
    const routeNode = nodes.find((node) => node.id === "orders.route");
    const listenerNode = nodes.find((node) => node.id === "orders.listener");
    expect(routeNode).toMatchObject({ kind: "trigger", triggerType: "http" });
    expect(listenerNode).toMatchObject({ kind: "trigger", triggerType: "event" });
    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "hook",
          id: "orders.get.before",
          ownerId: "orders.get",
          phase: "before",
        }),
        expect.objectContaining({
          kind: "hook",
          id: "orders.get.after",
          ownerId: "orders.get",
          phase: "after",
        }),
      ]),
    );
    expect(
      (routeNode?.config as { middleware: unknown[]; transforms: unknown[] }).middleware,
    ).toEqual([{ id: "orders.middleware", path: "/orders/*", order: 0, match: "always" }]);
    expect(
      (routeNode?.config as { middleware: unknown[]; transforms: unknown[] }).transforms,
    ).toEqual([expect.objectContaining({ id: "orders.normalize" })]);
    expect((listenerNode?.config as { expansion: readonly string[] }).expansion).toEqual([
      "orders.created@1",
      "orders.updated@2",
    ]);
    const serviceNode = nodes.find((node) => node.id === "orders" && node.kind === "service");
    expect(serviceNode).toMatchObject({
      title: "Orders",
      description: "Order operations",
      tags: ["orders"],
      members: [
        { name: "get", functionId: "orders.get" },
        { name: "helper", functionId: "orders.helper" },
        { name: "authorize", functionId: "orders.auth" },
      ],
      middleware: [{ id: "orders.context" }, { id: "orders.audit" }],
    });

    expect(result.graph?.edges).toEqual(
      expect.arrayContaining([
        { kind: "targets-function", from: "orders.route", to: "orders.get", role: "primary" },
        {
          kind: "uses-middleware",
          from: "orders.route",
          to: "orders.middleware",
          order: 0,
          match: "always",
        },
        {
          kind: "targets-function",
          from: "orders.listener",
          to: "zsys.event.orders.listener.handler",
          role: "primary",
        },
        { kind: "listens-to-event", from: "orders.listener", to: "orders.created" },
        { kind: "listens-to-event", from: "orders.listener", to: "orders.updated" },
        { kind: "uses-cache", from: "orders.get", to: "prices" },
        { kind: "uses-hook", from: "orders.get", to: "orders.get.before", phase: "before" },
        { kind: "uses-hook", from: "orders.get", to: "orders.get.after", phase: "after" },
        {
          kind: "contains-function",
          from: "orders",
          to: "orders.get",
          member: "get",
          order: 0,
        },
        {
          kind: "contains-function",
          from: "orders",
          to: "orders.helper",
          member: "helper",
          order: 1,
        },
        {
          kind: "contains-function",
          from: "orders",
          to: "orders.auth",
          member: "authorize",
          order: 2,
        },
        { kind: "uses-service-middleware", from: "orders", to: "orders.context", order: 0 },
        { kind: "uses-service-middleware", from: "orders", to: "orders.audit", order: 1 },
      ]),
    );
    expect(result.graph?.edges).not.toContainEqual({
      kind: "calls-function",
      from: "orders.get",
      to: "orders.helper",
    });
  });

  test("rejects a function declared by two services", () => {
    const target = defineFunction({
      id: "orders.get",
      input,
      output,
      handler: async () => ({ ok: true }),
    });
    const service = (id: string) => ({
      kind: "service" as const,
      id,
      ref: { kind: "service" as const, id },
      functions: { get: target },
    });
    const result = normalizeCompilation({
      descriptors: [target, service("orders"), service("billing")],
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "ZSYS_SERVICE_OWNERSHIP", descriptorId: "billing" }),
    );
  });
});

import { describe, expect, test } from "bun:test";
import { createRegistrationPlan, type ApplicationGraph } from "../../packages/graph/src/index.ts";

const source = { file: "src/app.ts", line: 1, column: 1 } as const;

function graph(): ApplicationGraph {
  return {
    contractVersion: 3,
    appId: "orders",
    nodes: [
      {
        kind: "function",
        invocationMode: "callable",
        id: "orders.create",
        domainId: "orders",
        exposure: "public",
        source,
        input: { type: "object" },
        output: { type: "object" },
      },
      {
        kind: "trigger",
        id: "orders.route",
        source,
        triggerType: "http",
        targetFunctionId: "orders.create",
        config: {
          method: "POST",
          path: "/orders",
          request: { kind: "input" },
          responses: [],
          middleware: [],
          transforms: [],
        },
      },
      {
        kind: "event",
        id: "orders.created",
        source,
        version: 1,
        input: { type: "object" },
      },
      {
        kind: "function",
        invocationMode: "event-only",
        id: "orders.react",
        source,
        input: { type: "object" },
        output: { "x-relkit-void": true },
      },
      {
        kind: "trigger",
        id: "orders.listener",
        source,
        triggerType: "event",
        targetFunctionId: "orders.react",
        config: {
          eventId: "orders.created",
          eventVersion: 1,
          delivery: "durable",
        },
      },
      {
        kind: "job",
        id: "orders.refresh",
        source,
        input: { type: "object" },
        targetFunctionId: "orders.create",
        profile: "default",
        schedule: [{ id: "hourly", cron: "0 * * * *" }],
      },
      {
        kind: "bucket",
        id: "orders.files",
        source,
        profile: "default",
        visibility: "private",
      },
      {
        kind: "cache",
        id: "orders.cache",
        source,
        key: { type: "string" },
        value: { type: "string" },
        profile: "default",
      },
      {
        kind: "tool",
        id: "orders.lookup-tool",
        source,
        targetFunctionId: "orders.create",
        description: "lookup",
        sideEffect: "read",
        approval: "never",
      },
      {
        kind: "agent",
        id: "orders.agent",
        source,
        input: { type: "object" },
        output: { type: "object" },
        model: "default",
        instructions: "help",
        toolIds: ["orders.lookup-tool"],
        limits: { maxSteps: 2 },
        generatedFunction: {
          generated: true,
          generatedBy: "agent",
          agentId: "orders.agent",
          functionId: "relkit.agent.orders.agent.invoke",
        },
      },
      {
        kind: "provider",
        id: "provider.buckets.default",
        source,
        profile: "default",
        capability: "buckets",
        adapter: "s3",
        ownership: "managed",
        configuration: {},
        environment: [],
      },
      {
        kind: "service",
        id: "orders",
        domainId: "orders",
        source,
        title: "Orders",
        functions: [{ name: "create", functionId: "orders.create" }],
        events: [],
      },
    ],
    edges: [],
  };
}

describe("registration planning", () => {
  test("projects every runtime registration family without acquiring resources", () => {
    const input = graph();
    const first = createRegistrationPlan(input);
    const second = createRegistrationPlan({ ...input, nodes: [...input.nodes].reverse() });

    expect(second).toEqual(first);
    expect(first.functions.map(({ id }) => id)).toEqual(["orders.create", "orders.react"]);
    expect(first.functions[0]).toMatchObject({ serviceId: "orders" });
    expect(first.httpTriggers.map(({ id }) => id)).toEqual(["orders.route"]);
    expect(first.httpTriggers[0]).toMatchObject({ serviceId: "orders" });
    expect(first.eventTriggers.map(({ id }) => id)).toEqual(["orders.listener"]);
    expect(first.queues.map(({ id }) => id)).toEqual(["orders.refresh"]);
    expect(first.schedules.map(({ id }) => id)).toEqual(["orders.refresh:hourly"]);
    expect(first.buckets.map(({ id }) => id)).toEqual(["orders.files"]);
    expect(first.caches.map(({ id }) => id)).toEqual(["orders.cache"]);
    expect(first.tools.map(({ id }) => id)).toEqual(["orders.lookup-tool"]);
    expect(first.agents.map(({ id }) => id)).toEqual(["orders.agent"]);
    expect(first.services?.map(({ id }) => id)).toEqual(["orders"]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.functions)).toBe(true);
    expect(Object.isFrozen(input.nodes[0])).toBe(false);
  });

  test("orders HTTP routes by precedence and keeps normalized duplicates visible", () => {
    const input = graph();
    const routes = [
      httpTrigger("orders.wildcard", "/orders/*"),
      httpTrigger("orders.optional-wildcard", "/orders/*parts?"),
      httpTrigger("orders.parameter-b", "/orders/:orderId"),
      httpTrigger("orders.exact", "/orders/new"),
      httpTrigger("orders.parameter-a", "/orders/:id"),
      httpTrigger("orders.duplicate", "/orders/:otherId"),
    ];
    const plan = createRegistrationPlan({ ...input, nodes: routes });

    expect(plan.httpTriggers.map(({ id }) => id)).toEqual([
      "orders.exact",
      "orders.duplicate",
      "orders.parameter-a",
      "orders.parameter-b",
      "orders.wildcard",
      "orders.optional-wildcard",
    ]);
    expect(plan.httpTriggers).toHaveLength(routes.length);
    expect(plan.httpTriggers.slice(1, 4).map(normalizedRouteKey)).toEqual([
      "GET /orders/:",
      "GET /orders/:",
      "GET /orders/:",
    ]);
  });
});

function httpTrigger(id: string, path: string) {
  return {
    kind: "trigger" as const,
    id,
    source,
    triggerType: "http" as const,
    targetFunctionId: "orders.create",
    config: {
      method: "GET",
      path,
      request: { kind: "input" },
      responses: [],
      middleware: [],
      transforms: [],
    },
  };
}

function normalizedRouteKey(route: { config: { method: string; path: string } }): string {
  const path = route.config.path
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ":" : segment))
    .join("/");
  return `${route.config.method.toUpperCase()} ${path}`;
}

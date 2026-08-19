import { describe, expect, test } from "bun:test";
import { createRegistrationPlan, type ApplicationGraph } from "../../packages/graph/src/index.ts";

const source = { file: "src/app.ts", line: 1, column: 1 } as const;

function graph(): ApplicationGraph {
  return {
    contractVersion: 1,
    appId: "orders",
    nodes: [
      {
        kind: "function",
        id: "orders.create",
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
        payload: { type: "object" },
      },
      {
        kind: "trigger",
        id: "orders.listener",
        source,
        triggerType: "event",
        targetFunctionId: "orders.create",
        config: {
          selector: { kind: "match", pattern: "orders.*" },
          expansion: ["orders.created@1"],
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
        modelProfile: "default",
        instructions: "help",
        toolIds: ["orders.lookup-tool"],
        limits: { maxSteps: 2 },
        generatedFunction: {
          generated: true,
          generatedBy: "agent",
          agentId: "orders.agent",
          functionId: "zsys.agent.orders.agent.invoke",
        },
      },
      {
        kind: "provider",
        id: "default",
        source,
        profile: "default",
        capabilities: ["buckets", "cache", "jobs", "events", "models"],
        configuration: {},
        environment: [],
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
    expect(first.functions.map(({ id }) => id)).toEqual(["orders.create"]);
    expect(first.httpTriggers.map(({ id }) => id)).toEqual(["orders.route"]);
    expect(first.eventTriggers.map(({ id }) => id)).toEqual(["orders.listener"]);
    expect(first.queues.map(({ id }) => id)).toEqual(["orders.refresh"]);
    expect(first.schedules.map(({ id }) => id)).toEqual(["orders.refresh:hourly"]);
    expect(first.buckets.map(({ id }) => id)).toEqual(["orders.files"]);
    expect(first.caches.map(({ id }) => id)).toEqual(["orders.cache"]);
    expect(first.tools.map(({ id }) => id)).toEqual(["orders.lookup-tool"]);
    expect(first.agents.map(({ id }) => id)).toEqual(["orders.agent"]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.functions)).toBe(true);
    expect(Object.isFrozen(input.nodes[0])).toBe(false);
  });

  test("orders HTTP routes by precedence and keeps normalized duplicates visible", () => {
    const input = graph();
    const routes = [
      httpTrigger("orders.wildcard", "/orders/*"),
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

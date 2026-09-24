import { describe, expect, test } from "vitest";
import { createRegistrationPlan } from "../src/index.js";
import { graph, source } from "./registration-plan.fixture.js";

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

  test("keeps task registrations out of legacy queues and schedules", () => {
    const input = graph();
    const task = {
      kind: "task" as const,
      id: "orders.refresh-task",
      source,
      taskId: "orders.refresh-task",
      version: "1",
      execution: "durable" as const,
      input: { type: "object" },
      output: { type: "object" },
    };
    const job = {
      kind: "job" as const,
      id: "orders.refresh-job",
      source,
      executionModel: "task" as const,
      name: "refreshOrders",
      jobId: "orders.refresh-job",
      taskId: "orders.refresh-task",
      taskVersion: "1",
      profile: "default",
      implicit: false,
      default: true,
      input: { type: "object" },
    };
    const plan = createRegistrationPlan({ ...input, nodes: [...input.nodes, task, job] });

    expect(plan.tasks?.map(({ taskId }) => taskId)).toEqual(["orders.refresh-task"]);
    expect(plan.jobs?.map(({ jobId }) => jobId)).toEqual(["orders.refresh-job"]);
    expect(plan.queues.map(({ id }) => id)).toEqual(["orders.refresh"]);
    expect(plan.schedules.map(({ id }) => id)).toEqual(["orders.refresh:hourly"]);
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

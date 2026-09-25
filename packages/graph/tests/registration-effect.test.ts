import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  GraphCanonicalizationError,
  createRegistrationPlan,
  createRegistrationPlanEffect,
} from "../src/index.js";
import { GraphEventTargetsError } from "../src/event-validation.js";
import { addNode, type MutableRegistrationPlan } from "../src/registration-plan-add.js";
import type { GraphNode } from "../src/index.js";
import { functionNode, graph, source } from "./graph-fixtures.js";
const functionWithDomain = functionNode({ domainId: "orders.service" });
describe("registration planning Effects", () => {
  test("projects schedule triggers, queues, and legacy job schedules in order", () => {
    const nodes = [
      functionWithDomain,
      {
        kind: "trigger",
        id: "orders.daily",
        source,
        triggerType: "schedule",
        targetFunctionId: "orders.create",
        config: { jobId: "orders.refresh", schedule: { cron: "0 0 * * *" } },
      },
      {
        kind: "trigger",
        id: "orders.hourly",
        source,
        triggerType: "schedule",
        targetFunctionId: "orders.create",
        config: { cron: "0 * * * *" },
      },
      {
        kind: "trigger",
        id: "orders.queue-trigger",
        source,
        triggerType: "queue",
        targetFunctionId: "orders.create",
        config: { queue: "orders" },
      },
      {
        kind: "job",
        id: "orders.legacy",
        source,
        targetFunctionId: "orders.create",
        profile: "default",
        schedule: [{ cron: "1 * * * *" }, { id: "named", cron: "2 * * * *" }],
      },
      {
        kind: "job",
        id: "orders.unscheduled",
        source,
        targetFunctionId: "orders.create",
        profile: "default",
        schedule: null,
      },
    ];
    const plan = Effect.runSync(createRegistrationPlanEffect(graph(nodes)));
    expect(plan.schedules.map(({ id }) => id)).toEqual([
      "orders.daily",
      "orders.hourly",
      "orders.legacy:0",
      "orders.legacy:named",
    ]);
    expect(plan.schedules.map(({ jobId }) => jobId)).toEqual([
      "orders.refresh",
      "orders.create",
      "orders.legacy",
      "orders.legacy",
    ]);
    expect(plan.queues.map(({ id }) => id)).toEqual([
      "orders.legacy",
      "orders.unscheduled",
      "orders.queue-trigger",
    ]);
    expect(plan.functions[0]?.serviceId).toBe("orders.service");
    expect(createRegistrationPlan(graph(nodes))).toEqual(plan);
  });
  test("projects remaining registration families without scheduling them", () => {
    const nodes = [
      {
        kind: "channel",
        id: "orders.channel",
        source,
        params: {},
        events: {},
        profile: "default",
        client: "internal",
      },
      { kind: "middleware", id: "orders.auth", source, path: "*", order: 0 },
      { kind: "event", id: "orders.created", source, version: 1, input: {}, profile: "default" },
      {
        kind: "task",
        id: "orders.send",
        source,
        taskId: "orders.send",
        version: "1",
        execution: "durable",
        input: {},
        output: {},
      },
      {
        kind: "task",
        id: "orders.analyze",
        source,
        taskId: "orders.analyze",
        version: "1",
        execution: "durable",
        input: {},
        output: {},
      },
      {
        kind: "job",
        id: "orders.send-job",
        source,
        executionModel: "task",
        taskId: "orders.send",
        taskVersion: "1",
        jobId: "orders.send-job",
        name: "send",
        profile: "default",
        implicit: false,
        default: true,
        input: {},
      },
      {
        kind: "job",
        id: "orders.analyze-job",
        source,
        executionModel: "task",
        taskId: "orders.analyze",
        taskVersion: "1",
        jobId: "orders.analyze-job",
        name: "analyze",
        profile: "default",
        implicit: false,
        default: true,
        input: {},
      },
    ];
    const plan = Effect.runSync(createRegistrationPlanEffect(graph(nodes)));
    expect(plan.channels.map(({ id }) => id)).toEqual(["orders.channel"]);
    expect(plan.middlewares.map(({ id }) => id)).toEqual(["orders.auth"]);
    expect(plan.events?.map(({ id }) => id)).toEqual(["orders.created"]);
    expect(plan.tasks?.map(({ id }) => id)).toEqual(["orders.analyze", "orders.send"]);
    expect(plan.jobs?.map(({ id }) => id)).toEqual(["orders.analyze-job", "orders.send-job"]);
    expect(plan.schedules).toEqual([]);
  });
  test("propagates tagged event and graph failures", () => {
    const forged = {
      kind: "trigger",
      id: "orders.event",
      source,
      triggerType: "event",
      targetFunctionId: "orders.create",
      config: { eventId: "orders.created", eventVersion: 1 },
    };
    expect(
      Effect.runSync(Effect.flip(createRegistrationPlanEffect(graph([functionNode(), forged])))),
    ).toBeInstanceOf(GraphEventTargetsError);
    const malformed = { contractVersion: 3, nodes: null, edges: [] } as never;
    expect(Effect.runSync(Effect.flip(createRegistrationPlanEffect(malformed)))).toBeInstanceOf(
      GraphCanonicalizationError,
    );
    expect(() => createRegistrationPlan(malformed)).toThrow(TypeError);
  });
  test("runs the direct synchronous node-registration adapter", () => {
    const plan = {
      graphHash: "sha256:test",
      functions: [],
      httpTriggers: [],
      tasks: [],
      jobs: [],
      queues: [],
      schedules: [],
      eventTriggers: [],
      events: [],
      buckets: [],
      caches: [],
      tools: [],
      agents: [],
      channels: [],
      services: [],
      middlewares: [],
    } as MutableRegistrationPlan;
    addNode(plan, functionNode() as unknown as GraphNode, new Map());
    expect(plan.functions.map(({ id }) => id)).toEqual(["orders.create"]);
  });
});

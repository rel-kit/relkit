import { describe, expect, test } from "bun:test";
import type { EventNode, FunctionNode, RegistrationPlan } from "@relkit/graph";
import {
  materializeEvents,
  type EventEngine,
  type EventInvocationOptions,
  type EventRuntimeProvider,
} from "./src/materialize-events.ts";

const source = { file: "src/events.ts", line: 1, column: 1 } as const;

describe("event materialization", () => {
  test("registers contracts and expansions, then invokes through the event engine", async () => {
    const calls: string[] = [];
    let binding: Parameters<EventRuntimeProvider["registerTrigger"]>[0] | undefined;
    const provider: EventRuntimeProvider = {
      registerContract: (contract) => calls.push(`${contract.id}@${contract.version}`),
      registerTrigger: (registered) => {
        binding = registered;
        calls.push(registered.id);
      },
    };
    let invocation: EventInvocationOptions | undefined;
    const engine: EventEngine = {
      invoke: async (options) => {
        invocation = options;
        return options.input;
      },
    };
    const materialized = await materializeEvents({
      plan: plan(),
      engine,
      providerRegistry: {
        resolve: (capability, profile) => {
          expect(capability).toBe("event");
          expect(profile).toBe("default");
          return { capability, profile, value: provider };
        },
      },
    });

    expect(calls).toEqual(["orders.created@1", "orders.listener"]);
    expect(materialized.triggers.get("orders.listener")).toMatchObject({
      eventId: "orders.created",
      eventVersion: 1,
    });

    const controller = new AbortController();
    const envelope = {
      instanceId: "event-1",
      eventId: "orders.created",
      version: 1,
      payload: { orderId: "order-1" },
      occurredAt: "2026-08-15T00:00:00.000Z",
      publishedAt: "2026-08-15T00:00:01.000Z",
      correlationId: "corr-1",
      causationInvocationId: "invocation-1",
      traceId: "trace-1",
      attributes: { source: "test" },
    } as const;

    await materialized.invoke("orders.listener", envelope, {
      signal: controller.signal,
      deadlineMs: 500,
    });

    expect(invocation).toMatchObject({
      functionId: "orders.handle",
      input: envelope.payload,
      source: "event-delivery",
      correlationId: "corr-1",
      traceId: "trace-1",
      signal: controller.signal,
      deadlineMs: 500,
      parent: {
        id: "invocation-1",
        traceId: "trace-1",
        correlationId: "corr-1",
        deadlineMs: 500,
        signal: controller.signal,
      },
    });
  });

  test("validates functions before resolving or binding providers", async () => {
    let resolved = 0;
    await expect(
      materializeEvents({
        plan: plan("missing"),
        engine: { invoke: async () => undefined },
        providerRegistry: {
          resolve: () => {
            resolved += 1;
            throw new Error("provider should not resolve");
          },
        },
      }),
    ).rejects.toThrow("unknown function missing");
    expect(resolved).toBe(0);
  });

  test("registers each event contract only with its selected profile", async () => {
    const registrations: string[] = [];
    const base = plan();
    const eventPlan: RegistrationPlan = {
      ...base,
      events: [
        ...base.events!,
        {
          kind: "event",
          id: "audit.recorded",
          source,
          version: 1,
          input: null,
          profile: "audit",
        },
      ],
    };
    await materializeEvents({
      plan: eventPlan,
      engine: { invoke: async () => undefined },
      providerRegistry: {
        resolve: (capability, profile) => ({
          capability,
          profile,
          value: {
            registerContract: (contract: EventNode) =>
              registrations.push(`${profile}:${contract.id}`),
            registerTrigger: () => undefined,
          },
        }),
      },
    });

    expect(registrations).toEqual(["default:orders.created", "audit:audit.recorded"]);
  });
});

function plan(targetFunctionId = "orders.handle"): RegistrationPlan {
  const functionNode: FunctionNode = {
    kind: "function",
    invocationMode: "event-only",
    id: "orders.handle",
    source,
    input: { type: "object" },
    output: { type: "object" },
  };
  const eventNode: EventNode = {
    kind: "event",
    id: "orders.created",
    source,
    version: 1,
    input: { type: "object" },
    profile: "default",
  };
  return {
    graphHash: "sha256:events",
    functions: [functionNode],
    httpTriggers: [],
    queues: [],
    schedules: [],
    events: [eventNode],
    eventTriggers: [
      {
        kind: "trigger",
        id: "orders.listener",
        source,
        triggerType: "event",
        targetFunctionId,
        config: {
          eventId: "orders.created",
          eventVersion: 1,
          delivery: "durable",
        },
      },
    ],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
  };
}

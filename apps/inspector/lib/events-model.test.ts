import { describe, expect, test } from "bun:test";
import type { InspectorEventRuntime, InspectorGraph } from "./api-types";
import { deliveryCounts, eventView } from "./events-model";

const graph = {
  graph: {
    nodes: [
      { kind: "function", id: "orders.publish" },
      { kind: "function", id: "orders.send-email", invocationMode: "event-only" },
      { kind: "event", id: "orders.created", version: 2, input: { type: "object" } },
      {
        kind: "trigger",
        id: "orders.email",
        triggerType: "event",
        targetFunctionId: "orders.send-email",
        config: {
          eventId: "orders.created",
          eventVersion: 2,
          delivery: "durable",
          retry: { maxAttempts: 3 },
        },
      },
    ],
    edges: [
      { kind: "publishes-event", from: "orders.publish", to: "orders.created" },
      { kind: "listens-to-event", from: "orders.email", to: "orders.created" },
      { kind: "targets-function", from: "orders.email", to: "orders.send-email" },
    ],
  },
} as unknown as InspectorGraph;

const runtime = {
  protocol: "relkit.inspector",
  version: 1,
  eventProtocol: "relkit.events.admin",
  eventVersion: 1,
  events: [],
  triggers: [],
  capabilities: [],
  publications: [{ eventId: "orders.created", version: 2, instanceId: "event-1" }],
  items: [],
  deliveries: [
    { eventId: "orders.created", state: "dead-lettered", attempt: 3 },
    { eventId: "orders.created", state: "completed", attempt: 1 },
  ],
  deadLetters: [{ eventId: "orders.created", state: "dead-lettered", attempt: 3 }],
} as InspectorEventRuntime;

describe("inspector event projections", () => {
  test("joins versioned contracts, publishers, trigger listeners, and delivery state", () => {
    const view = eventView(graph, runtime, "orders.created");
    if (view === undefined) throw new Error("event view missing");
    expect(view).toMatchObject({
      event: { id: "orders.created", version: 2 },
      publishers: [{ from: "orders.publish" }],
      listeners: [{ id: "orders.email", targetFunctionId: "orders.send-email" }],
      consumers: [{ id: "orders.send-email", invocationMode: "event-only" }],
      deliveries: [{ state: "dead-lettered" }, { state: "completed" }],
      deadLetters: [{ state: "dead-lettered" }],
      publications: [{ instanceId: "event-1" }],
    });
    expect(deliveryCounts(view.deliveries)).toMatchObject({ completed: 1, "dead-lettered": 1 });
  });

  test("derives consumers only through exact-event trigger edges", () => {
    const data = graph.graph as { nodes: unknown[]; edges: Array<{ kind: string }> };
    const disconnected = {
      graph: { ...data, edges: data.edges.filter((edge) => edge.kind !== "targets-function") },
    } as InspectorGraph;
    expect(eventView(disconnected, runtime, "orders.created")?.consumers).toEqual([]);
  });
});

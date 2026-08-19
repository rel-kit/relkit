import { describe, expect, test } from "bun:test";
import type { InspectorEventRuntime, InspectorGraph } from "./api-types";
import { deliveryCounts, eventView } from "./events-model";

const graph = {
  graph: {
    nodes: [
      { kind: "function", id: "orders.publish" },
      { kind: "event", id: "orders.created", version: 2, payload: { type: "object" } },
      {
        kind: "trigger",
        id: "orders.email",
        triggerType: "event",
        targetFunctionId: "orders.send-email",
        config: {
          selector: { kind: "match", pattern: "orders.*" },
          expansion: ["orders.created@2"],
          delivery: "durable",
          retry: { maxAttempts: 3 },
        },
      },
    ],
    edges: [{ kind: "publishes-event", from: "orders.publish", to: "orders.created" }],
  },
} as unknown as InspectorGraph;

const runtime = {
  protocol: "zsys.inspector",
  version: 1,
  eventProtocol: "zsys.events.admin",
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
      deliveries: [{ state: "dead-lettered" }, { state: "completed" }],
      deadLetters: [{ state: "dead-lettered" }],
      publications: [{ instanceId: "event-1" }],
    });
    expect(deliveryCounts(view.deliveries)).toMatchObject({ completed: 1, "dead-lettered": 1 });
  });

  test("uses event-trigger/listener terminology without creating another resource kind", () => {
    const terms = ["event", "event-trigger", "listener", "delivery", "publisher"];
    const applicationResource = ["sub", "scription"].join("");
    expect(terms).toContain("event-trigger");
    expect(terms).toContain("listener");
    expect(terms).not.toContain(applicationResource);
  });
});

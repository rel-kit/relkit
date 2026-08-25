import { describe, expect, test } from "bun:test";
import {
  GRAPH_EDGE_KINDS,
  GRAPH_NODE_KINDS,
  isGraphEdgeKind,
  isGraphNodeKind,
  type AgentNode,
  type ApplicationGraph,
  type HttpTriggerConfig,
  type TargetsFunctionEdge,
} from "../../packages/graph/src/index.ts";

const source = { file: "src/app.ts", line: 1, column: 1 } as const;

describe("graph model", () => {
  test("exposes only the approved node and declared edge kinds", () => {
    expect(GRAPH_NODE_KINDS).toEqual([
      "app",
      "env",
      "function",
      "trigger",
      "job",
      "event",
      "bucket",
      "cache",
      "tool",
      "agent",
      "provider",
      "service",
      "middleware",
      "hook",
    ]);
    expect(GRAPH_EDGE_KINDS).toEqual([
      "targets-function",
      "calls-function",
      "enqueues-job",
      "publishes-event",
      "listens-to-event",
      "uses-bucket",
      "uses-cache",
      "invokes-agent",
      "exposes-as-tool",
      "uses-tool",
      "uses-provider-profile",
      "contains-function",
      "uses-service-middleware",
      "uses-middleware",
      "uses-hook",
    ]);
    expect(isGraphNodeKind("route")).toBe(false);
    expect(isGraphNodeKind("event-trigger")).toBe(false);
    expect(isGraphEdgeKind("unknown")).toBe(false);
  });

  test("models ordered HTTP metadata and generated agent identity as data", () => {
    const config: HttpTriggerConfig = {
      method: "POST",
      path: "/orders",
      request: { kind: "input" },
      responses: [],
      middleware: [
        { id: "auth", path: "/orders/*", order: 0, match: "always" },
        { id: "audit", path: "*", order: 1, match: "always" },
      ],
      transforms: [{ id: "orders.normalize", schema: { type: "object" } }],
    };
    const generated = {
      generated: true as const,
      generatedBy: "agent" as const,
      agentId: "orders.support",
      functionId: "zsys.agent.orders.support.invoke",
    };
    const agent: AgentNode = {
      kind: "agent",
      id: "orders.support",
      source,
      input: { type: "object" },
      output: { type: "object" },
      model: "default",
      instructions: "help with orders",
      toolIds: ["orders.lookup"],
      limits: { maxSteps: 3 },
      generatedFunction: generated,
    };
    const edge: TargetsFunctionEdge = {
      kind: "targets-function",
      from: "orders.route",
      to: "orders.create",
      role: "primary",
    };
    const graph: ApplicationGraph = {
      contractVersion: 3,
      appId: "orders",
      nodes: [agent],
      edges: [edge],
    };
    expect(config.middleware.map((entry) => entry.id)).toEqual(["auth", "audit"]);
    expect(config.transforms[0]?.id).toBe("orders.normalize");
    expect(graph.nodes[0]?.kind).toBe("agent");
    expect(graph.edges[0]?.kind).toBe("targets-function");
  });
});

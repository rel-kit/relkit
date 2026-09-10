import { describe, expect, expectTypeOf, test } from "bun:test";
import { END, START, StateSchema } from "@langchain/langgraph";
import { z } from "@relkit/schema";
import {
  defineGraph,
  defineGraphNode,
  isAgentDescriptor,
  validateGraphRoute,
} from "./src/index.js";

const state = new StateSchema({
  orderId: z.string(),
  summary: z.string().optional(),
  approved: z.boolean().optional(),
  secret: z.string().optional(),
});
const lookup = defineGraphNode({
  id: "lookup",
  input: z.object({ orderId: z.string() }),
  output: z.object({ summary: z.string() }),
  handler: ({ orderId }) => ({ summary: `Order ${orderId}` }),
});
const review = defineGraphNode({
  id: "review",
  input: z.object({ summary: z.string() }),
  output: z.object({ approved: z.boolean() }),
  ends: [END] as const,
  handler: () => ({ approved: true }),
});
const limits = { maxSteps: 10, maxToolCalls: 10, timeoutMs: 10_000 };

describe("defineGraph", () => {
  test("records a deterministic inspectable topology", () => {
    const graph = defineGraph({
      id: "order-review",
      state,
      input: z.object({ orderId: z.string() }),
      output: z.object({ approved: z.boolean() }),
      nodes: [lookup, review],
      edges: (edge) =>
        edge.addEdge(START, "lookup").addEdge("lookup", "review").addEdge("review", END),
      limits,
      stateProfile: "default",
      client: { public: true, state: ["summary", "approved"] },
      controls: ["stop"],
    });

    expect(isAgentDescriptor(graph)).toBe(true);
    expect(graph.execution).toBe("graph");
    expect(graph.workflow).toEqual({
      version: 1,
      start: START,
      end: END,
      nodes: [
        expect.objectContaining({ id: "lookup", kind: "node", ends: [] }),
        expect.objectContaining({ id: "review", kind: "node", ends: [END] }),
      ],
      edges: [
        { kind: "edge", from: START, to: "lookup" },
        { kind: "edge", from: "lookup", to: "review" },
        { kind: "edge", from: "review", to: END },
      ],
    });
    expect(JSON.stringify(graph)).not.toContain("handler");
    expectTypeOf(graph.input).toEqualTypeOf<ReturnType<typeof z.object>>();
  });

  test("preserves joins and conditional route labels", () => {
    const graph = defineGraph({
      id: "parallel",
      state,
      input: z.object({ orderId: z.string() }),
      output: z.object({ approved: z.boolean() }),
      nodes: [lookup, review],
      edges: (edge) =>
        edge
          .addEdge(START, "lookup")
          .addEdge(START, "review")
          .addEdge(["lookup", "review"], "review")
          .addConditionalEdges("review", ({ approved }) => (approved ? "yes" : "no"), {
            yes: END,
            no: "lookup",
          }),
      limits,
    });

    expect(graph.workflow.edges).toContainEqual({
      kind: "join",
      from: ["lookup", "review"],
      to: "review",
    });
    expect(graph.workflow.edges).toContainEqual({
      kind: "conditional",
      from: "review",
      routes: [
        { label: "yes", to: END },
        { label: "no", to: "lookup" },
      ],
      dynamic: false,
    });
  });

  test("rejects invalid nodes, routes, selections, and duplicate edges", () => {
    const define = (
      nodes = [lookup, review] as const,
      edges: Parameters<typeof defineGraph>[0]["edges"] = (edge) => edge.addEdge(START, "lookup"),
    ) =>
      defineGraph({
        id: "invalid",
        state,
        input: z.object({ orderId: z.string() }),
        output: z.object({ approved: z.boolean() }),
        nodes,
        edges,
        limits,
      });

    expect(() => define([lookup, lookup] as never)).toThrow('Duplicate graph node "lookup"');
    expect(() => define(undefined, (edge) => edge.addEdge(START, "missing" as never))).toThrow(
      'Unknown graph node "missing"',
    );
    expect(() =>
      define(undefined, (edge) => edge.addEdge(START, "lookup").addEdge(START, "lookup")),
    ).toThrow("Duplicate graph edge");
    expect(() => define(undefined, (edge) => edge.addEdge(["lookup", "review"], END))).toThrow(
      "Graph join destination must be a node",
    );
    expect(() =>
      defineGraph({
        id: "bad-output",
        state,
        input: z.object({ orderId: z.string() }),
        output: z.object({ missing: z.string() }),
        nodes: [lookup],
        edges: (edge) => edge.addEdge(START, "lookup"),
        limits,
      }),
    ).toThrow('Graph output field "missing" is not in state');
    expect(() => validateGraphRoute("missing", new Set(["lookup", "review"]))).toThrow(
      'Unknown graph node "missing"',
    );
    expect(() => validateGraphRoute("review", new Set(["lookup", "review"]), { yes: END })).toThrow(
      'Unknown graph route label "review"',
    );
  });
});

if (false) {
  defineGraph({
    state,
    input: z.object({ orderId: z.string() }),
    output: z.object({ approved: z.boolean() }),
    nodes: [lookup, review],
    // @ts-expect-error Edge endpoints are inferred exclusively from nodes.
    edges: (edge) => edge.addEdge(START, "missing"),
    limits,
  });
  defineGraph({
    state,
    input: z.object({ orderId: z.string() }),
    output: z.object({ approved: z.boolean() }),
    // @ts-expect-error Duplicate literal node ids are rejected.
    nodes: [lookup, lookup],
    edges: (edge) => edge,
    limits,
  });
}

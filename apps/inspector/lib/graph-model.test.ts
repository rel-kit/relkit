import { describe, expect, test } from "bun:test";
import { normalizeGraphResponse, type GraphSnapshot } from "./graph-model";
import { layoutGraph } from "./graph-layout";
import { filterGraph, graphKinds } from "./graph-filter";
import { withExecutionOverlay } from "./graph-execution-model";
import { workflowDefinitions } from "./workflow-definition-model";
import type { InspectorGraph } from "./api-types";

function response(
  nodes: readonly unknown[],
  edges: readonly unknown[],
  observedEdges: readonly unknown[],
) {
  return {
    protocol: "relkit.inspector",
    version: 1,
    generationId: "generation-one",
    graphHash: "sha256:fixture",
    graph: { appId: "commerce-example", nodes, edges, observedEdges },
  } as InspectorGraph;
}

describe("inspector graph model", () => {
  test("sorts graph data deterministically and keeps observed edges separate", () => {
    const nodes = [
      { kind: "function", id: "orders.create" },
      { kind: "trigger", id: "orders.create.http" },
    ];
    const edges = [
      { kind: "targets-function", from: "orders.create.http", to: "orders.create" },
      {
        kind: "exposes-function",
        from: "orders",
        to: "orders.create",
        member: "create",
        order: 1,
      },
      {
        kind: "exposes-function",
        from: "orders",
        to: "orders.get",
        member: "get",
        order: 0,
      },
    ];
    const observedEdges = [
      { relationship: "cache.read", from: "orders.create", to: "orders.cache" },
    ];
    const first = normalizeGraphResponse(response(nodes, edges, observedEdges));
    const second = normalizeGraphResponse(
      response([...nodes].reverse(), [...edges].reverse(), observedEdges),
    );
    expect(first).toEqual(second);
    expect(first.declaredEdges[0]?.relationship).toBe("declared");
    expect(
      first.declaredEdges
        .filter((edge) => edge.kind === "exposes-function")
        .map((edge) => edge.order),
    ).toEqual([0, 1]);
    expect(first.observedEdges[0]?.relationship).toBe("observed");
  });

  test("lays out 1,000 nodes with ELK", async () => {
    const nodes = Array.from({ length: 1_000 }, (_, index) => ({
      kind: "function",
      id: `fn.${String(index).padStart(4, "0")}`,
    }));
    const edges = nodes.slice(1).map((node, index) => ({
      kind: "calls",
      from: nodes[index]!.id,
      to: node.id,
    }));
    const graph: GraphSnapshot = {
      generationId: "generation-one",
      graphHash: "sha256:fixture",
      integrations: [],
      nodes,
      declaredEdges: edges.map((edge) => ({ ...edge, relationship: "declared" as const })),
      observedEdges: [],
    };
    const layout = await layoutGraph(graph);
    expect(layout.nodes).toHaveLength(1_000);
    expect(layout.edges).toHaveLength(999);
    expect(layout.nodes[0]?.x).toBeLessThan(layout.nodes.at(-1)?.x ?? 0);
    expect(layout.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(
      true,
    );
  });

  test("extracts graph definitions without agents, tools, resources, or todo prose", async () => {
    const payload = response(
      [
        {
          kind: "agent",
          id: "orders.review",
          execution: "graph",
          toolIds: ["orders.lookup"],
          clientContract: {
            tools: [{ id: "orders.lookup" }, { id: "write_todos" }],
          },
          values: { todos: [{ content: "private prose", status: "pending" }] },
          workflow: {
            start: "__start__",
            end: "__end__",
            nodes: [
              { id: "lookup", kind: "node", ends: ["__end__"] },
              { id: "nested", kind: "subgraph" },
            ],
            edges: [
              { kind: "edge", from: "__start__", to: "lookup" },
              { kind: "edge", from: "lookup", to: "lookup" },
            ],
          },
          workflowTopology: {
            start: "__start__",
            end: "__end__",
            registeredNodes: ["lookup", "nested"],
            conditionalRoutes: [{ from: "lookup", routes: [{ label: "done", to: "__end__" }] }],
            dynamicRoutes: [],
            parallelBranches: [{ from: "__start__", to: ["lookup", "nested"] }],
            joins: [],
            loops: [{ from: "lookup", to: "lookup" }],
            subgraphs: ["nested"],
          },
          resourceDependencies: [{ kind: "checkpointer", ownership: "borrowed" }],
        },
        { kind: "tool", id: "orders.lookup" },
      ],
      [{ kind: "uses-tool", from: "orders.review", to: "orders.lookup" }],
      [],
    );
    const graph = normalizeGraphResponse(payload);

    expect(graph.nodes.map((node) => node.kind)).toEqual([
      "graph",
      "graph-end",
      "graph-node",
      "graph-start",
      "resource-checkpointer",
      "subgraph",
      "tool",
      "tool",
    ]);
    expect(graph.declaredEdges.map((edge) => edge.kind)).toContain("loop");
    expect(graph.declaredEdges.map((edge) => edge.kind)).toContain("conditional:done");
    expect(graph.declaredEdges.map((edge) => edge.kind)).toContain("command");
    expect(JSON.stringify(graph)).not.toContain("private prose");
    const [definition] = workflowDefinitions(payload);
    expect(definition?.id).toBe("orders.review");
    expect(definition?.graph.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining(["START", "END", "lookup", "nested"]),
    );
    expect(definition?.graph.nodes.some((node) => node.kind === "agent")).toBe(false);
    expect(graph.nodes.find((node) => node.id === "orders.review")?.kind).toBe("graph");
    expect(definition?.graph.nodes.some((node) => node.kind === "tool")).toBe(false);
    const layout = await layoutGraph(definition!.graph, "DOWN");
    const start = layout.nodes.find((node) => node.node.kind === "graph-start")!;
    const end = layout.nodes.find((node) => node.node.kind === "graph-end")!;
    expect(start.y).toBeLessThan(end.y);
  });

  test("filters nodes and edges without changing deterministic source order", () => {
    const graph = normalizeGraphResponse(
      response(
        [
          { kind: "function", id: "orders.create" },
          { kind: "trigger", id: "orders.create.http" },
          { kind: "function", id: "users.create" },
        ],
        [{ kind: "targets-function", from: "orders.create.http", to: "orders.create" }],
        [],
      ),
    );
    expect(graphKinds(graph)).toEqual(["function", "trigger"]);
    expect(filterGraph(graph, "orders", "all").nodes.map((node) => node.id)).toEqual([
      "orders.create",
      "orders.create.http",
    ]);
    expect(filterGraph(graph, "", "function").edges).toEqual([]);
  });

  test("keeps live executions and retry attempts separate from definitions", () => {
    const graph = normalizeGraphResponse(response([{ kind: "agent", id: "assistant" }], [], []));
    const live = withExecutionOverlay(graph, "assistant", {
      agentId: "assistant",
      runs: [{ runId: "run:1", status: "running" }],
      executions: [{ scope: ["research"], agent: "researcher", status: "running" }],
      attempts: [
        { id: "attempt:1", scope: ["research"], name: "search", attempt: 2, status: "failed" },
      ],
      transitions: [{ from: "lookup", to: "review", kind: "running" }],
    });

    expect(live.nodes.filter((node) => node.observed).map((node) => node.kind)).toEqual([
      "execution-run",
      "live-execution",
      "retry-attempt",
    ]);
    expect(live.observedEdges.map((edge) => edge.kind)).toContain("retry");
    expect(live.observedEdges.map((edge) => edge.kind)).toContain("transition:running");
  });
});

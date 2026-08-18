import { describe, expect, test } from "bun:test";
import { normalizeGraphResponse, type GraphSnapshot } from "./graph-model";
import { layoutGraph } from "./graph-layout";
import type { InspectorGraph } from "./api-types";

function response(
  nodes: readonly unknown[],
  edges: readonly unknown[],
  observedEdges: readonly unknown[],
) {
  return {
    protocol: "zsys.inspector",
    version: 1,
    generationId: "generation-one",
    graphHash: "sha256:fixture",
    graph: { appId: "fixture-commerce", nodes, edges, observedEdges },
  } as InspectorGraph;
}

describe("inspector graph model", () => {
  test("sorts graph data deterministically and keeps observed edges separate", () => {
    const nodes = [
      { kind: "function", id: "orders.create" },
      { kind: "trigger", id: "orders.create.http" },
    ];
    const edges = [{ kind: "targets-function", from: "orders.create.http", to: "orders.create" }];
    const observedEdges = [
      { relationship: "cache.read", from: "orders.create", to: "orders.cache" },
    ];
    const first = normalizeGraphResponse(response(nodes, edges, observedEdges));
    const second = normalizeGraphResponse(
      response([...nodes].reverse(), [...edges].reverse(), observedEdges),
    );
    expect(first).toEqual(second);
    expect(first.declaredEdges[0]?.relationship).toBe("declared");
    expect(first.observedEdges[0]?.relationship).toBe("observed");
  });

  test("lays out 1,000 nodes with bounded linear work and stable positions", () => {
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
      nodes,
      declaredEdges: edges.map((edge) => ({ ...edge, relationship: "declared" as const })),
      observedEdges: [],
    };
    const layout = layoutGraph(graph);
    expect(layout.nodes).toHaveLength(1_000);
    expect(layout.edges).toHaveLength(999);
    expect(layout.nodes[0]?.x).not.toBe(layout.nodes[31]?.x);
    expect(layout.nodes[0]?.x).toBe(layout.nodes[32]?.x);
    expect(layout.nodes[0]?.y).toBeLessThan(layout.nodes[32]?.y ?? 0);
  });
});

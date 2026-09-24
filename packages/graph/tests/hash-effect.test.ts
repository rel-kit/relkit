import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { JsonValueError, SourceLocationError } from "@relkit/contracts";
import {
  GraphCanonicalizationError,
  canonicalizeGraph,
  canonicalGraphJsonEffect,
  canonicalizeGraphEffect,
  hashGraph,
  hashGraphEffect,
  sortGraphEdges,
  sortGraphEdgesEffect,
  sortGraphNodes,
  sortGraphNodesEffect,
} from "../src/index.js";
const graph = { contractVersion: 3, nodes: [{ kind: "app", id: "orders" }], edges: [] };
describe("graph hash Effect operations", () => {
  test("sorts nodes and edges deterministically in both APIs", () => {
    const nodes = [
      { kind: "function", id: "z" },
      { kind: "app", id: "a" },
    ];
    const edges = [
      { kind: "calls-function", from: "z", to: "a" },
      { kind: "calls-function", from: "a", to: "z" },
    ];
    expect(Effect.runSync(sortGraphNodesEffect(nodes)).map((node) => node.id)).toEqual(["a", "z"]);
    expect(sortGraphNodes(nodes).map((node) => node.id)).toEqual(["a", "z"]);
    expect(Effect.runSync(sortGraphEdgesEffect(edges)).map((edge) => edge.from)).toEqual([
      "a",
      "z",
    ]);
    expect(sortGraphEdges(edges).map((edge) => edge.from)).toEqual(["a", "z"]);
  });
  test("preserves graph digest and canonical JSON across Effects and adapters", () => {
    const canonical = Effect.runSync(canonicalizeGraphEffect(graph));
    expect(canonical.nodes[0]).toEqual(graph.nodes[0]);
    expect(canonicalizeGraph(graph)).toEqual(canonical);
    expect(Effect.runSync(canonicalGraphJsonEffect(graph))).toContain('"id":"orders"');
    expect(Effect.runSync(hashGraphEffect(graph))).toBe(hashGraph(graph));
  });
  test("returns tagged errors for non-plain values, invalid paths, and invalid JSON", () => {
    const nonPlain = { ...graph, nodes: [new Date()] };
    expect(Effect.runSync(Effect.flip(canonicalizeGraphEffect(nonPlain)))).toBeInstanceOf(
      GraphCanonicalizationError,
    );
    expect(Effect.runSync(Effect.flip(sortGraphNodesEffect([new Date()])))).toBeInstanceOf(
      GraphCanonicalizationError,
    );
    expect(Effect.runSync(Effect.flip(sortGraphEdgesEffect([new Date()])))).toBeInstanceOf(
      GraphCanonicalizationError,
    );
    const source = { file: "../outside.ts", line: 1, column: 1 };
    expect(
      Effect.runSync(
        Effect.flip(canonicalizeGraphEffect({ ...graph, nodes: [{ ...graph.nodes[0], source }] })),
      ),
    ).toBeInstanceOf(SourceLocationError);
    expect(
      Effect.runSync(
        Effect.flip(
          canonicalGraphJsonEffect({ ...graph, nodes: [{ kind: "app", id: "orders", value: 1n }] }),
        ),
      ),
    ).toBeInstanceOf(JsonValueError);
    expect(() => sortGraphNodes([new Date()])).toThrow(TypeError);
  });
  test("rejects a non-object graph after canonicalization", () => {
    const invalid = null as unknown as typeof graph;
    expect(Effect.runSync(Effect.flip(canonicalizeGraphEffect(invalid)))).toBeInstanceOf(
      GraphCanonicalizationError,
    );
  });
  test("uses canonical JSON to break ties between otherwise identical nodes", () => {
    const nodes = [
      { kind: "function", id: "same", value: 2 },
      { kind: "function", id: "same", value: 1 },
    ];
    expect(sortGraphNodes(nodes).map((node) => node.value)).toEqual([1, 2]);
  });
});

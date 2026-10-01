import type { GraphCompilationFailure } from "./normalize-graph.types.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { GRAPH_VERSION } from "@relkit/contracts";
import {
  canonicalizeGraphEffect,
  hashGraphEffect as hashCanonicalGraphEffect,
} from "@relkit/graph";
import { buildGraphEdgesEffect } from "./normalize-graph-edges.js";
import { buildGraphNodesEffect } from "./normalize-graph-nodes.js";
import type { NormalizedGraph, NormalizationWork } from "./normalize-types.js";

/**
 * Assembles canonical nodes and edges into a normalized graph.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that assembles canonical nodes and edges into a normalized graph; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const buildGraphEffect: (
  work: NormalizationWork,
) => Effect.Effect<NormalizedGraph, GraphCompilationFailure> = Effect.fn("Compiler.buildGraph")(
  function* (work: NormalizationWork): Effect.fn.Return<NormalizedGraph, GraphCompilationFailure> {
    const app = work.descriptors.find((descriptor) => descriptor.kind === "app");
    const nodes = yield* buildGraphNodesEffect(work);
    work.nodes = nodes;
    const edges = yield* buildGraphEdgesEffect(work);
    work.edges = edges;
    return (yield* canonicalizeGraphEffect(
      {
        contractVersion: GRAPH_VERSION,
        ...(app === undefined ? {} : { appId: app.id }),
        nodes,
        edges,
      },
      work.input.projectRoot === undefined ? {} : { projectRoot: work.input.projectRoot },
    )) as NormalizedGraph;
  },
  (effect, work) =>
    observeCompiler("normalization", "buildGraph", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Assembles canonical nodes and edges into a normalized graph.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A canonical normalized graph with deterministically ordered nodes and edges.
 */
export function buildGraph(work: NormalizationWork): NormalizedGraph {
  return runCompilerSync(buildGraphEffect(work));
}

/**
 * Hashes the canonical normalized graph contract.
 * @param graph - Canonical normalized graph.
 * @returns The canonical graph's SHA-256 fingerprint.
 */
export function hashGraph(graph: NormalizedGraph): string {
  return runCompilerSync(hashGraphEffect(graph));
}

/**
 * Hashes canonical graph bytes in the caller's runtime.
 * @param graph - Canonical normalized graph.
 * @returns A lazy effect yielding its SHA-256 identity, or a typed graph/path/JSON failure.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const hashGraphEffect: (
  graph: NormalizedGraph,
) => Effect.Effect<string, GraphCompilationFailure> = Effect.fn("Compiler.hashGraph")(
  function* (graph: NormalizedGraph): Effect.fn.Return<string, GraphCompilationFailure> {
    return yield* hashCanonicalGraphEffect(graph);
  },
  (effect, graph) =>
    observeCompiler("normalization", "hashGraph", effect, () => ({
      nodes: graph.nodes.length,
      edges: graph.edges.length,
    })),
);

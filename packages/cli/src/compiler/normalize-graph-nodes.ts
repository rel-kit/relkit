import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { environmentNodes } from "./normalize-graph-app.js";
import { providerNodes } from "./normalize-graph-providers.js";
import { generatedFunctionNode } from "./normalize-generated-function.js";
import { graphNodeForEffect } from "./normalize-graph-node.js";
import type { GraphNode, NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";
import { graphIdForDescriptor } from "./normalize-graph-id.js";
import { add } from "./normalize-pass-utils.js";
import { NORMALIZE_CODES } from "./normalize-codes.js";

/**
 * Projects graph nodes in deterministic descriptor order.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that projects graph nodes in deterministic descriptor order; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const buildGraphNodesEffect = Effect.fn("Compiler.buildGraphNodes")(
  function* (work: NormalizationWork) {
    const nodes: GraphNode[] = [];
    const middlewareOrder = new Map(
      [...work.middlewareReferences.keys()].sort().map((id, order) => [id, order]),
    );
    yield* Effect.forEach(
      work.descriptors,
      (descriptor) =>
        Effect.gen(function* () {
          const node = yield* graphNodeForEffect(descriptor, work, middlewareOrder);
          if (node !== undefined) nodes.push(node);
          nodes.push(...hookNodes(descriptor));
          if (descriptor.kind === "agent") nodes.push(generatedFunctionNode(descriptor, work));
          if (descriptor.kind === "app") {
            nodes.push(...environmentNodes(descriptor));
            nodes.push(...providerNodes(descriptor));
          }
        }),
      { discard: true },
    );
    validateGraphIds(work, nodes);
    return nodes;
  },
  (effect, work) =>
    observeCompiler("normalization", "buildGraphNodes", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Projects graph nodes in deterministic descriptor order.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Graph node projections in deterministic descriptor order.
 */
export function buildGraphNodes(work: NormalizationWork): GraphNode[] {
  return runCompilerSync(buildGraphNodesEffect(work));
}

/**
 * Checks graph node identity collisions with source evidence.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param nodes - Normalized graph nodes to inspect.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function validateGraphIds(work: NormalizationWork, nodes: readonly GraphNode[]): void {
  const seen = new Map<string, GraphNode>();
  for (const node of nodes) {
    const previous = seen.get(node.id);
    if (previous !== undefined && previous.kind !== node.kind) {
      const owner =
        work.descriptors.find((descriptor) => graphIdForDescriptor(descriptor) === node.id) ??
        work.descriptors[0];
      if (owner !== undefined) {
        add(
          work,
          owner,
          NORMALIZE_CODES.graphIdCollision,
          `Graph identity "${node.id}" collides with ${previous.kind} and ${node.kind} nodes.`,
        );
      }
    } else if (previous === undefined) seen.set(node.id, node);
  }
}

/**
 * Projects executable lifecycle hooks into graph nodes.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns Graph nodes for descriptor lifecycle hooks.
 */
function hookNodes(descriptor: NormalizedDescriptor): GraphNode[] {
  if (descriptor.kind === "task") return taskHookNodes(descriptor);
  if (descriptor.kind !== "function" && descriptor.kind !== "tool") return [];
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  return (["before", "after"] as const).flatMap((phase) => {
    const hook = value[phase === "before" ? "onBefore" : "onAfter"];
    if (!isExecutableMarker(hook)) return [];
    return [
      {
        kind: "hook",
        id: `${descriptor.id}.${phase}`,
        source: descriptor.source,
        ...(descriptor.domainId === undefined ? {} : { domainId: descriptor.domainId }),
        ownerId: descriptor.id,
        ownerKind: descriptor.kind,
        phase,
      },
    ];
  });
}

/**
 * Projects task hook nodes carrying stable executable identities.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns Task hook nodes with stable executable identities.
 */
function taskHookNodes(descriptor: NormalizedDescriptor): GraphNode[] {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const ownerId = graphIdForDescriptor(descriptor);
  return (["start", "success", "failure"] as const).flatMap((phase) => {
    const field = phase === "start" ? "onStart" : phase === "success" ? "onSuccess" : "onFailure";
    if (!isExecutableMarker(value[field])) return [];
    return [
      {
        kind: "hook",
        id: `${ownerId}.${phase}`,
        source: descriptor.source,
        ...(descriptor.domainId === undefined ? {} : { domainId: descriptor.domainId }),
        ownerId,
        ownerKind: "task" as const,
        phase,
      },
    ];
  });
}

/**
 * Recognizes live functions and evaluator executable markers.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when graph data carries a generated executable marker.
 */
function isExecutableMarker(value: unknown): boolean {
  return typeof value === "function" || (isRecord(value) && value.$relkit === "function");
}

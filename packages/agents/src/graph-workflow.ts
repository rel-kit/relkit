import { END, START } from "@langchain/langgraph";
import type { JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { isFunctionGraphNode, type FunctionGraphNodeDescriptor } from "@relkit/functions";
import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";
import type { GraphNodeAny } from "./define-graph-node.js";
import { isSubgraphNode, subgraphForNode, type SubgraphNodeDescriptor } from "./graph-subgraph.js";
import type { GraphEdgeOperation } from "./graph-edges.js";
import { graphWorkflowFailure } from "./graph-workflow-error.js";
import type { GraphWorkflow, GraphWorkflowEdge, GraphWorkflowNode } from "./graph-workflow.types.js";

export type * from "./graph-workflow.types.js";

/** Projects a frozen serializable graph workflow from authoring nodes and edges.
 * @param nodes - Validated graph nodes.
 * @param edges - Validated graph edge operations.
 * @returns An Effect with a workflow or GraphWorkflowFailure.
 * @example Effect.runSync(graphWorkflowEffect(nodes, edges));
 */
export const graphWorkflowEffect = Effect.fn("Agents.graph.workflow")(
  <Id extends string, State>(
    nodes: readonly (GraphNodeAny | FunctionGraphNodeDescriptor | SubgraphNodeDescriptor)[],
    edges: readonly GraphEdgeOperation<Id, State>[],
  ) => Effect.try({
    try: (): GraphWorkflow => Object.freeze({
      version: 1 as const,
      start: START,
      end: END,
      nodes: Object.freeze(nodes.map(workflowNode)),
      edges: Object.freeze(edges.map(workflowEdge)),
    }),
    catch: graphWorkflowFailure,
  }),
  (effect) => observeAgent("graph.workflow", effect),
);

/** Projects a workflow for existing synchronous graph callers.
 * @param nodes - Validated graph nodes.
 * @param edges - Validated graph edge operations.
 * @returns A frozen serializable workflow.
 * @throws The original node or schema projection error.
 * @example graphWorkflow(nodes, edges);
 */
export function graphWorkflow<Id extends string, State>(
  nodes: readonly (GraphNodeAny | FunctionGraphNodeDescriptor | SubgraphNodeDescriptor)[],
  edges: readonly GraphEdgeOperation<Id, State>[],
): GraphWorkflow {
  return Effect.runSync(graphWorkflowEffect(nodes, edges).pipe(
    Effect.catchTag("GraphWorkflowFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

/** Checks whether any graph node has a resumable continuation.
 * @param workflow - Frozen graph workflow.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(graphWorkflowRequiresPersistenceEffect(workflow));
 */
export const graphWorkflowRequiresPersistenceEffect = Effect.fn("Agents.graph.requiresPersistence")(
  (workflow: GraphWorkflow) => Effect.sync(() => requiresPersistence(workflow)),
  (effect) => observeAgent("graph.requires-persistence", effect),
);

/** Checks persistence needs for existing synchronous graph callers.
 * @param workflow - Frozen graph workflow.
 * @returns Whether any node has a resumable continuation.
 * @example graphWorkflowRequiresPersistence(workflow);
 */
export function graphWorkflowRequiresPersistence(workflow: GraphWorkflow): boolean {
  return Effect.runSync(graphWorkflowRequiresPersistenceEffect(workflow));
}

function requiresPersistence(workflow: GraphWorkflow): boolean {
  return workflow.nodes.some(
    (node) =>
      node.resume !== undefined ||
      (node.workflow !== undefined && requiresPersistence(node.workflow)),
  );
}

function workflowNode(
  node: GraphNodeAny | FunctionGraphNodeDescriptor | SubgraphNodeDescriptor,
): GraphWorkflowNode {
  const subgraph = isSubgraphNode(node);
  return Object.freeze({
    id: node.id,
    kind: subgraph ? "subgraph" : isFunctionGraphNode(node) ? "function" : "node",
    input: schemaValue(node.input),
    output: schemaValue(node.output),
    ...(!isFunctionGraphNode(node) && !subgraph && node.resume !== undefined
      ? { resume: schemaValue(node.resume) }
      : {}),
    ends: Object.freeze(isFunctionGraphNode(node) ? [] : [...node.ends]),
    ...(isFunctionGraphNode(node) ? { targetFunctionId: node.target.id } : {}),
    ...(subgraph ? { workflow: subgraphForNode(node).workflow } : {}),
  });
}

function workflowEdge<Id extends string, State>(
  edge: GraphEdgeOperation<Id, State>,
): GraphWorkflowEdge {
  if (edge.kind === "edge") {
    return Object.freeze(
      Array.isArray(edge.start)
        ? { kind: "join" as const, from: Object.freeze([...edge.start]), to: edge.end }
        : { kind: "edge" as const, from: edge.start as string, to: edge.end },
    );
  }
  const routes = Object.freeze(
    Object.entries(edge.destinations ?? {}).map(([label, to]) => Object.freeze({ label, to })),
  );
  return Object.freeze({
    kind: "conditional" as const,
    from: edge.source,
    routes,
    dynamic: edge.destinations === undefined,
  });
}

function schemaValue(schema: StandardSchemaV1): JsonValue {
  const result = getJsonSchema(schema);
  return result.ok ? result.schema : null;
}

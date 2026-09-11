import { END, START } from "@langchain/langgraph";
import type { JsonValue } from "@relkit/contracts";
import { isFunctionGraphNode, type FunctionGraphNodeDescriptor } from "@relkit/functions";
import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";
import type { GraphNodeAny } from "./define-graph-node.js";
import { isSubgraphNode, subgraphForNode, type SubgraphNodeDescriptor } from "./graph-subgraph.js";
import type { GraphEdgeOperation } from "./graph-edges.js";

export interface GraphWorkflowNode {
  readonly id: string;
  readonly kind: "node" | "function" | "subgraph";
  readonly input: JsonValue;
  readonly output: JsonValue;
  readonly resume?: JsonValue;
  readonly ends: readonly string[];
  readonly targetFunctionId?: string;
  readonly workflow?: GraphWorkflow;
}

export type GraphWorkflowEdge =
  | { readonly kind: "edge"; readonly from: string; readonly to: string }
  | { readonly kind: "join"; readonly from: readonly string[]; readonly to: string }
  | {
      readonly kind: "conditional";
      readonly from: string;
      readonly routes: readonly { readonly label: string; readonly to: string }[];
      readonly dynamic: boolean;
    };

export interface GraphWorkflow {
  readonly version: 1;
  readonly start: typeof START;
  readonly end: typeof END;
  readonly nodes: readonly GraphWorkflowNode[];
  readonly edges: readonly GraphWorkflowEdge[];
}

export function graphWorkflow<Id extends string, State>(
  nodes: readonly (GraphNodeAny | FunctionGraphNodeDescriptor | SubgraphNodeDescriptor)[],
  edges: readonly GraphEdgeOperation<Id, State>[],
): GraphWorkflow {
  return Object.freeze({
    version: 1 as const,
    start: START,
    end: END,
    nodes: Object.freeze(nodes.map(workflowNode)),
    edges: Object.freeze(edges.map(workflowEdge)),
  });
}

export function graphWorkflowRequiresPersistence(workflow: GraphWorkflow): boolean {
  return workflow.nodes.some(
    (node) =>
      node.resume !== undefined ||
      (node.workflow !== undefined && graphWorkflowRequiresPersistence(node.workflow)),
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

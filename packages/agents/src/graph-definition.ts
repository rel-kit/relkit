import { StateSchema, type AnyStateSchema } from "@langchain/langgraph";
import { isFunctionGraphNode } from "@relkit/functions";
import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";
import { isRecord } from "./agent-validation.js";
import type { GraphNodeLike } from "./define-graph.js";
import { assertGraphNodeDestinations, isGraphNodeDescriptor } from "./define-graph-node.js";
import {
  createGraphEdgeBuilder,
  type GraphEdgeBuilder,
  type GraphEdgeOperation,
} from "./graph-edges.js";
import { isSubgraphNode } from "./graph-subgraph.js";

export function prepareGraphDefinition(
  state: AnyStateSchema,
  input: StandardSchemaV1,
  output: StandardSchemaV1,
  sourceNodes: readonly GraphNodeLike[],
  edges: (builder: GraphEdgeBuilder<string, any>) => unknown,
): {
  readonly nodes: readonly GraphNodeLike[];
  readonly operations: readonly GraphEdgeOperation<string, any>[];
  readonly stateKeys: Set<string>;
} {
  if (!StateSchema.isInstance(state)) throw new TypeError("Graph state must be a StateSchema");
  if (!Array.isArray(sourceNodes) || sourceNodes.length === 0) {
    throw new TypeError("Graph nodes must be a non-empty array");
  }
  const stateKeys = new Set(Object.keys(state.fields));
  assertSelection(input, stateKeys, "input");
  assertSelection(output, stateKeys, "output");
  const nodes = Object.freeze([...sourceNodes]);
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (!isGraphNodeDescriptor(node) && !isFunctionGraphNode(node) && !isSubgraphNode(node)) {
      throw new TypeError("Graph nodes must be graph-node descriptors");
    }
    if (["__start__", "__end__", "__interrupt__"].includes(node.id)) {
      throw new TypeError(`Graph node id "${node.id}" is reserved`);
    }
    if (stateKeys.has(node.id))
      throw new TypeError(`Graph node id "${node.id}" collides with state`);
    if (nodeIds.has(node.id)) throw new TypeError(`Duplicate graph node "${node.id}"`);
    nodeIds.add(node.id);
    assertSelection(node.input, stateKeys, `node "${node.id}" input`);
    assertSelection(node.output, stateKeys, `node "${node.id}" output`);
  }
  for (const node of nodes) {
    if (isGraphNodeDescriptor(node) || isSubgraphNode(node)) {
      assertGraphNodeDestinations(node, nodeIds);
    }
  }
  if (typeof edges !== "function") throw new TypeError("Graph edges must be a function");
  const recorded = createGraphEdgeBuilder<string, any>(nodeIds);
  edges(recorded.builder);
  return {
    nodes,
    operations: Object.freeze([...recorded.operations]),
    stateKeys,
  };
}

function assertSelection(
  schema: StandardSchemaV1,
  stateKeys: ReadonlySet<string>,
  name: string,
): void {
  const result = getJsonSchema(schema);
  const projected = result.ok ? result.schema : undefined;
  if (projected?.type !== "object" || !isRecord(projected.properties)) {
    throw new TypeError(`Graph ${name} must expose an object JSON Schema`);
  }
  for (const key of Object.keys(projected.properties)) {
    if (!stateKeys.has(key)) throw new TypeError(`Graph ${name} field "${key}" is not in state`);
  }
}

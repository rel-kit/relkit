import { StateGraph } from "@langchain/langgraph";
import { isFunctionGraphNode } from "@relkit/functions";
import { graphExecution, type GraphDescriptor, type GraphNodeLike } from "./define-graph.js";
import { isGraphNodeDescriptor } from "./define-graph-node.js";
import { validateGraphRoute } from "./graph-edges.js";
import { selectGraphState } from "./graph-state-schema.js";
import { isSubgraphNode, subgraphForNode } from "./graph-subgraph.js";
import type { ResolvedGraphPersistence } from "./graph-persistence.js";

export function compileGraph(
  descriptor: GraphDescriptor,
  persistence: ResolvedGraphPersistence = {},
) {
  const execution = graphExecution(descriptor);
  const native = new StateGraph({
    state: execution.state,
    input: selectGraphState(execution.state, descriptor.input),
    output: selectGraphState(execution.state, descriptor.output),
  }) as any;
  const ids = new Set(descriptor.nodes.map((node) => node.id));
  for (const node of descriptor.nodes) {
    native.addNode(node.id, nodeAction(node), {
      ...((isGraphNodeDescriptor(node) || isSubgraphNode(node)) && node.ends.length > 0
        ? { ends: node.ends }
        : {}),
    });
  }
  for (const edge of execution.operations) {
    if (edge.kind === "edge") {
      native.addEdge(edge.start, edge.end);
      continue;
    }
    const route = async (state: unknown, config: unknown) => {
      const destination = await edge.route(state, config as never);
      validateGraphRoute(destination, ids, edge.destinations);
      return destination;
    };
    native.addConditionalEdges(edge.source, route, edge.destinations);
  }
  return native.compile({
    name: descriptor.id,
    ...(persistence.checkpointer === undefined ? {} : { checkpointer: persistence.checkpointer }),
    ...(persistence.store === undefined ? {} : { store: persistence.store }),
  });
}

function nodeAction(node: GraphNodeLike) {
  if (isSubgraphNode(node)) return compileGraph(subgraphForNode(node));
  return isFunctionGraphNode(node)
    ? (state: unknown) => node.invoke(state as never)
    : (state: unknown, config: unknown) => node.handler(state as never, config as never);
}

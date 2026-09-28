import { StateGraph, type LangGraphRunnableConfig } from "@langchain/langgraph";
import type { MaybePromise } from "@relkit/contracts";
import { isFunctionGraphNode } from "@relkit/functions";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { graphCompilationFailure } from "./graph-compile-error.js";
import { graphExecution, type GraphDescriptor, type GraphNodeLike } from "./define-graph.js";
import { isGraphNodeDescriptor } from "./define-graph-node.js";
import { validateGraphRoute } from "./graph-edges.js";
import { selectGraphState } from "./graph-state-schema.js";
import { isSubgraphNode, subgraphForNode } from "./graph-subgraph.js";
import type { ResolvedGraphPersistence } from "./graph-persistence.js";

/** Runs a user route and validates its destination with linked cancellation.
 * @param route - User conditional route.
 * @param state - Current graph state.
 * @param config - LangGraph configuration.
 * @param nodeIds - Valid node identities.
 * @param destinations - Optional route label map.
 * @returns An Effect with a destination or GraphCompilationFailure.
 * @example await Effect.runPromise(runGraphRouteEffect(route, state, config, ids));
 */
export const runGraphRouteEffect = Effect.fn("Agents.graph.route")(
  function* <Id extends string>(
    route: (state: unknown, config: LangGraphRunnableConfig) => MaybePromise<unknown>,
    state: unknown,
    config: LangGraphRunnableConfig,
    nodeIds: ReadonlySet<Id>,
    destinations?: Readonly<Record<string, Id | "__end__">>,
  ) {
    const destination = yield* Effect.tryPromise({
      try: (effectSignal) => Promise.resolve(route(state, {
        ...config,
        signal: config.signal === undefined ? effectSignal : AbortSignal.any([config.signal, effectSignal]),
      })),
      catch: graphCompilationFailure,
    });
    yield* Effect.try({
      try: () => validateGraphRoute(destination, nodeIds, destinations),
      catch: graphCompilationFailure,
    });
    return destination;
  },
  (effect) => observeAgent("graph.route", effect),
);

/** Compiles a graph descriptor and its resolved persistence resources.
 * @param descriptor - Authored graph descriptor.
 * @param persistence - Resolved checkpointer and store.
 * @returns An Effect with a LangGraph runnable or GraphCompilationFailure.
 * @example Effect.runSync(compileGraphEffect(graph));
 */
export const compileGraphEffect = Effect.fn("Agents.graph.compile")(
  (descriptor: GraphDescriptor, persistence: ResolvedGraphPersistence = {}) => Effect.try({
    try: () => {
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
        const route = (state: unknown, config: LangGraphRunnableConfig) =>
          Effect.runPromise(runGraphRouteEffect(edge.route, state, config, ids, edge.destinations).pipe(
            Effect.catchTag("GraphCompilationFailure", (failure) => Effect.fail(failure.cause)),
          ));
        native.addConditionalEdges(edge.source, route, edge.destinations);
      }
      return native.compile({
        name: descriptor.id,
        ...(persistence.checkpointer === undefined ? {} : { checkpointer: persistence.checkpointer }),
        ...(persistence.store === undefined ? {} : { store: persistence.store }),
      });
    },
    catch: graphCompilationFailure,
  }),
  (effect) => observeAgent("graph.compile", effect),
);

/** Compiles a graph for existing synchronous runtime callers.
 * @param descriptor - Authored graph descriptor.
 * @param persistence - Resolved checkpointer and store.
 * @returns A LangGraph runnable.
 * @throws The original compilation error.
 * @example const runnable = compileGraph(graph);
 */
export function compileGraph(descriptor: GraphDescriptor, persistence: ResolvedGraphPersistence = {}) {
  return Effect.runSync(compileGraphEffect(descriptor, persistence).pipe(
    Effect.catchTag("GraphCompilationFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function nodeAction(node: GraphNodeLike) {
  if (isSubgraphNode(node)) return compileGraph(subgraphForNode(node));
  return isFunctionGraphNode(node)
    ? (state: unknown) => node.invoke(state as never)
    : (state: unknown, config: unknown) => node.handler(state as never, config as never);
}

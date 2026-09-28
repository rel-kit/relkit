import { getJsonSchema } from "@relkit/schema";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { GraphDescriptor } from "./define-graph.js";
import { isGraphNodeDescriptor } from "./define-graph-node.js";
import { isSubgraphNode, subgraphForNode } from "./graph-subgraph.js";
import type { GraphWaitingInterrupt } from "./graph-interruption.js";
import type { CompiledGraph, GraphConfig } from "./graph-continuation.types.js";
import { graphContinuationFailure } from "./graph-continuation-error.js";

/** Reads waiting interrupts from the graph state snapshot.
 * @param graph - Compiled LangGraph instance.
 * @param descriptor - Source graph descriptor for node schemas.
 * @param config - Optional persistent thread configuration.
 * @returns An Effect with waiting interrupts or GraphContinuationFailure.
 * @example Effect.runPromise(waitingInterruptsEffect(graph, descriptor, config));
 */
export const waitingInterruptsEffect = Effect.fn("Agents.graph.waiting")(
  function* (graph: CompiledGraph, descriptor: GraphDescriptor, config: GraphConfig) {
    const snapshot = yield* Effect.tryPromise({
      try: () => graph.getState(config, { subgraphs: true }),
      catch: graphContinuationFailure,
    });
    return yield* Effect.try({
      try: () => snapshotInterrupts(snapshot, descriptor, []),
      catch: graphContinuationFailure,
    });
  },
  (effect) => observeAgent("graph.waiting", effect),
);

/** Reads waiting interrupts for existing Promise callers.
 * @param graph - Compiled LangGraph instance.
 * @param descriptor - Source graph descriptor for node schemas.
 * @param config - Optional persistent thread configuration.
 * @returns Waiting interrupts in task order.
 * @throws The original graph state or schema failure.
 * @example await waitingInterrupts(graph, descriptor, config);
 */
export function waitingInterrupts(
  graph: CompiledGraph,
  descriptor: GraphDescriptor,
  config: GraphConfig,
): Promise<readonly GraphWaitingInterrupt[]> {
  return Effect.runPromise(
    waitingInterruptsEffect(graph, descriptor, config).pipe(
      Effect.catchTag("GraphContinuationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

function snapshotInterrupts(
  snapshot: any,
  descriptor: GraphDescriptor,
  path: readonly string[],
): readonly GraphWaitingInterrupt[] {
  return snapshot.tasks.flatMap((task: any) => {
    const node = descriptor.nodes.find((candidate) => candidate.id === task.name);
    if (isSubgraphNode(node) && task.state?.tasks !== undefined) {
      return snapshotInterrupts(task.state, subgraphForNode(node), [...path, node.id]);
    }
    if (!isGraphNodeDescriptor(node) || node.resume === undefined) return [];
    const projection = getJsonSchema(node.resume);
    return task.interrupts.map((entry: { readonly id?: string; readonly value?: unknown }) => ({
      ...(entry.id === undefined ? {} : { id: entry.id }),
      node: [...path, task.name].join("/"),
      ...(entry.value === undefined ? {} : { value: entry.value }),
      response: projection.ok ? projection.schema : null,
    }));
  });
}

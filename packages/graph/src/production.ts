import { Data, Effect } from "effect";
import { observeGraph, runGraph } from "./graph-observability.js";
import type { ApplicationGraph, HttpTriggerConfig } from "./model.js";

/**
 * Tagged failure for a graph that cannot be activated in production.
 * @example Effect.catchTag("GraphProductionError", (error) => Effect.logWarning(error.message));
 */
export class GraphProductionError extends Data.TaggedError("GraphProductionError")<{
  readonly message: string;
  readonly routeId: string;
}> {}

/**
 * Rejects HTTP rate limits without a shared store before production activation.
 * @param graph - Application graph to inspect.
 * @returns An Effect that succeeds with void or fails with GraphProductionError.
 * @example Effect.runSync(assertProductionGraphEffect(graph));
 */
export function assertProductionGraphEffect(
  graph: ApplicationGraph,
): Effect.Effect<void, GraphProductionError> {
  return observeGraph(
    "production.assert",
    Effect.gen(function* () {
      for (const node of graph.nodes) {
        if (node.kind !== "trigger" || node.triggerType !== "http") continue;
        const config = node.config as unknown as HttpTriggerConfig;
        if (
          config.rateLimit !== undefined &&
          config.rateLimit !== null &&
          config.rateLimit.storeId === undefined
        ) {
          return yield* Effect.fail(
            new GraphProductionError({
              routeId: node.id,
              message: `Route "${node.id}" requires a shared rate-limit cache store in production.`,
            }),
          );
        }
      }
    }),
  );
}

/**
 * Synchronous compatibility adapter for production graph validation.
 * @param graph - Application graph to inspect.
 * @returns Void when the graph is production safe.
 * @throws Error when an HTTP rate limit lacks a shared store.
 * @example assertProductionGraph(graph);
 */
export function assertProductionGraph(graph: ApplicationGraph): void {
  try {
    return runGraph(assertProductionGraphEffect(graph));
  } catch (error) {
    if (error instanceof GraphProductionError) throw new Error(error.message);
    throw error;
  }
}

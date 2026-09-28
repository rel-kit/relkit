import { Command } from "@langchain/langgraph";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { graphExecution, type GraphDescriptor } from "./define-graph.js";
import { graphContinuationFailure } from "./graph-continuation-error.js";
import type { CompiledGraph, GraphConfig } from "./graph-continuation.types.js";
import { validateGraphResumeInputEffect } from "./graph-continuation-validation.js";
import { waitingInterruptsEffect } from "./graph-continuation-waiting.js";
import type { GraphWaitingInterrupt } from "./graph-interruption.js";

export type { GraphConfig } from "./graph-continuation.types.js";
export { validateGraphResumeInput, validateGraphResumeInputEffect } from "./graph-continuation-validation.js";
export { waitingInterrupts, waitingInterruptsEffect } from "./graph-continuation-waiting.js";

/** Builds a persistent graph run configuration.
 * @param descriptor - Graph whose checkpointer determines thread requirements.
 * @param threadId - Optional persistent thread identity.
 * @returns An Effect with configuration or GraphContinuationFailure.
 * @example Effect.runSync(graphConfigEffect(graph, "thread"));
 */
export const graphConfigEffect = Effect.fn("Agents.graph.config")(
  (descriptor: GraphDescriptor, threadId?: string) => Effect.try({
    try: (): GraphConfig => {
      const persistent = graphExecution(descriptor).checkpointer !== undefined;
      if (persistent && (typeof threadId !== "string" || threadId.length === 0)) {
        throw new TypeError("Graph execution with a checkpointer requires threadId");
      }
      return threadId === undefined ? {} : { configurable: { thread_id: threadId } };
    },
    catch: graphContinuationFailure,
  }),
  (effect) => observeAgent("graph.config", effect),
);

/** Builds graph run configuration for existing synchronous callers.
 * @param descriptor - Graph whose checkpointer determines thread requirements.
 * @param threadId - Optional persistent thread identity.
 * @returns Run configuration.
 * @throws The original missing thread error.
 * @example const config = graphConfig(graph, "thread");
 */
export function graphConfig(descriptor: GraphDescriptor, threadId?: string): GraphConfig {
  return Effect.runSync(graphConfigEffect(descriptor, threadId).pipe(
    Effect.catchTag("GraphContinuationFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

/** Validates a reply and constructs a native LangGraph resume command.
 * @param graph - Compiled graph with the waiting snapshot.
 * @param descriptor - Source graph descriptor.
 * @param config - Persistent thread configuration.
 * @param value - User reply or ordered replies.
 * @returns An Effect with a native command or GraphContinuationFailure.
 * @example Effect.runPromise(resumeCommandEffect(graph, descriptor, config, reply));
 */
export const resumeCommandEffect = Effect.fn("Agents.graph.resumeCommand")(
  function* (graph: CompiledGraph, descriptor: GraphDescriptor, config: GraphConfig, value: unknown) {
    yield* Effect.try({
      try: () => {
        if (graphExecution(descriptor).checkpointer === undefined) {
          throw new TypeError("Graph resume requires a checkpointer");
        }
      },
      catch: graphContinuationFailure,
    });
    const requests = yield* waitingInterruptsEffect(graph, descriptor, config);
    const reply = yield* validateGraphResumeInputEffect(descriptor, requests, value);
    return yield* Effect.try({
      try: () => new Command({ resume: nativeResume(requests, reply) }),
      catch: graphContinuationFailure,
    });
  },
  (effect) => observeAgent("graph.resume-command", effect),
);

/** Constructs a native resume command for existing Promise callers.
 * @param graph - Compiled graph with the waiting snapshot.
 * @param descriptor - Source graph descriptor.
 * @param config - Persistent thread configuration.
 * @param value - User reply or ordered replies.
 * @returns A native LangGraph resume command.
 * @throws The original state or continuation validation error.
 * @example await resumeCommand(graph, descriptor, config, reply);
 */
export function resumeCommand(
  graph: CompiledGraph,
  descriptor: GraphDescriptor,
  config: GraphConfig,
  value: unknown,
): Promise<Command> {
  return Effect.runPromise(resumeCommandEffect(graph, descriptor, config, value).pipe(
    Effect.catchTag("GraphContinuationFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function nativeResume(requests: readonly GraphWaitingInterrupt[], value: unknown): unknown {
  const values = requests.length === 1 ? [value] : (value as readonly unknown[]);
  const entries = requests.map((request, index) => {
    if (request.id === undefined) throw new TypeError("Graph interruption has no native ID");
    return [request.id, values[index]] as const;
  });
  return Object.fromEntries(entries);
}

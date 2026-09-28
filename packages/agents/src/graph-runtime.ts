import { normalizeId } from "@relkit/contracts";
import { frameworkTrace } from "@relkit/invocation";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { generatedAgentFunctionId } from "./generated-function.js";
import { graphInvocationFailure } from "./graph-runtime-error.js";
import { runCompiledGraph } from "./graph-runtime-execution.js";
import { GraphInvocationIdentity, GraphInvocationIdentityLive } from "./graph-runtime-identity.js";
import type { GraphRuntimeOptions } from "./graph-runtime.types.js";
import { resolveAgentContentLimitsEffect } from "./runtime-model.js";
import { signalFailure, validateValue, withSignal } from "./runtime-utils.js";
import { acquireExecutionSignalEffect, ExecutionSignalClockLive } from "./signal.js";

export type { GraphRuntimeOptions } from "./graph-runtime.types.js";
export { GraphInvocationFailure } from "./graph-runtime-error.js";
export { GraphInvocationIdentity, GraphInvocationIdentityLive } from "./graph-runtime-identity.js";

/** Invokes a graph with scoped signal cleanup and linked Effect cancellation.
 * @param options - Graph, engine, input, and invocation integrations.
 * @returns An Effect with graph output or GraphInvocationFailure.
 * @example Effect.runPromise(Effect.provide(invokeGraphEffect(options), GraphInvocationIdentityLive));
 */
export const invokeGraphEffect = Effect.fn("Agents.graph.invoke")(
  function* (options: GraphRuntimeOptions) {
    const identity = yield* GraphInvocationIdentity;
    const invocationId = yield* Effect.try({
      try: () => normalizeId(options.invocationId ?? `agent-${identity.randomUUID()}`),
      catch: graphInvocationFailure,
    });
    const traceId = yield* Effect.try({
      try: () => normalizeId(options.traceId ?? invocationId),
      catch: graphInvocationFailure,
    });
    const limits = yield* resolveAgentContentLimitsEffect(options).pipe(
      Effect.mapError((failure) => graphInvocationFailure(failure.cause)),
    );
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const execution = yield* acquireExecutionSignalEffect(options).pipe(
          Effect.mapError((failure) => graphInvocationFailure(failure.cause)),
          Effect.provide(ExecutionSignalClockLive),
        );
        return yield* Effect.tryPromise({
          try: (effectSignal) => {
            const signal = AbortSignal.any([execution.signal, effectSignal]);
            return frameworkTrace.span(
              `relkit.agent.${options.agent.id}.invoke`,
              {
                input: options.input,
                attributes: {
                  "relkit.agent.id": options.agent.id,
                  "relkit.function.id": generatedAgentFunctionId(options.agent.id),
                  "relkit.invocation.id": invocationId,
                  "relkit.agent.execution": "graph",
                },
              },
              async () => {
                if (signal.aborted) throw signalFailure(signal);
                const input = options.resume
                  ? options.input
                  : await withSignal(
                      validateValue(options.agent.input, options.input, "input"),
                      signal,
                    );
                return runCompiledGraph(
                  options,
                  input,
                  signal,
                  invocationId,
                  traceId,
                  limits.maxOutputBytes,
                );
              },
            );
          },
          catch: graphInvocationFailure,
        });
      }),
    );
  },
  (effect) => observeAgent("graph.invoke", effect),
);

/** Invokes a graph for existing Promise runtime callers.
 * @param options - Graph, engine, input, and invocation integrations.
 * @returns Validated graph output.
 * @throws The original graph, provider, validation, or cancellation error.
 * @example await invokeGraph(options);
 */
export function invokeGraph(options: GraphRuntimeOptions): Promise<unknown> {
  return Effect.runPromise(
    invokeGraphEffect(options).pipe(
      Effect.catchTag("GraphInvocationFailure", (failure) => Effect.fail(failure.cause)),
      Effect.provide(GraphInvocationIdentityLive),
    ),
  );
}

import { currentInvocationScope, runInInvocationScope } from "@relkit/invocation";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { compileGraphEffect } from "./graph-compile.js";
import { graphConfigEffect } from "./graph-continuation.js";
import { resolveGraphPersistenceEffect } from "./graph-persistence.js";
import { GraphInvocationFailure, graphInvocationFailure } from "./graph-runtime-error.js";
import { streamCompiledGraphEffect } from "./graph-runtime-stream.js";
import type { GraphRuntimeOptions } from "./graph-runtime.types.js";
import { graphWorkflowRequiresPersistenceEffect } from "./graph-workflow.js";
import { createAgentInvocationDispatcherEffect } from "./runtime-tool-dispatcher.js";
import { signalFailure } from "./signal.js";

/** Runs one compiled graph with persistence and a linked invocation scope.
 * @param options - Graph and runtime integrations.
 * @param input - Validated invocation input.
 * @param signal - Invocation cancellation signal.
 * @param invocationId - Stable invocation identity.
 * @param traceId - Trace identity.
 * @param maxOutputBytes - Output byte cap.
 * @returns An Effect with graph output or GraphInvocationFailure.
 * @example await Effect.runPromise(runCompiledGraphEffect(options, input, signal, id, trace, 1024));
 */
export const runCompiledGraphEffect = Effect.fn("Agents.graph.runCompiled")(
  function* (
    options: GraphRuntimeOptions,
    input: unknown,
    signal: AbortSignal,
    invocationId: string,
    traceId: string,
    maxOutputBytes: number,
  ) {
    if (signal.aborted) return yield* Effect.fail(graphInvocationFailure(signalFailure(signal)));
    const persistence = yield* resolveGraphPersistenceEffect(
      options.agent,
      options.environment ?? {},
    ).pipe(Effect.mapError((failure) => graphInvocationFailure(failure.cause)));
    if (
      persistence.checkpointer === undefined &&
      (yield* graphWorkflowRequiresPersistenceEffect(options.agent.workflow))
    ) {
      return yield* Effect.fail(
        graphInvocationFailure(new TypeError("Graphs with resumable nodes require a checkpointer")),
      );
    }
    const graph = yield* compileGraphEffect(options.agent, persistence).pipe(
      Effect.mapError((failure) => graphInvocationFailure(failure.cause)),
    );
    const config = yield* graphConfigEffect(options.agent, options.threadId).pipe(
      Effect.mapError((failure) => graphInvocationFailure(failure.cause)),
    );
    const current = yield* Effect.sync(() => currentInvocationScope());
    const dispatcher =
      current?.dispatcher ??
      (yield* createAgentInvocationDispatcherEffect(
        options.engine,
        options,
        invocationId,
        traceId,
        options.parentSpanId,
        signal,
      ));
    return yield* Effect.tryPromise({
      try: (effectSignal) => {
        const combined = AbortSignal.any([signal, effectSignal]);
        const scope =
          current === undefined
            ? { dispatcher, parent: { id: invocationId, traceId, signal: combined } }
            : current;
        return Promise.resolve(
          runInInvocationScope(scope, () =>
            Effect.runPromise(
              streamCompiledGraphEffect(options, graph, config, input, combined, maxOutputBytes),
              { signal: combined },
            ),
          ),
        );
      },
      catch: (cause) =>
        graphInvocationFailure(cause instanceof GraphInvocationFailure ? cause.cause : cause),
    });
  },
  (effect) => observeAgent("graph.run-compiled", effect),
);

/** Runs a compiled graph for existing Promise callers.
 * @param options - Graph and runtime integrations.
 * @param input - Validated invocation input.
 * @param signal - Invocation cancellation signal.
 * @param invocationId - Stable invocation identity.
 * @param traceId - Trace identity.
 * @param maxOutputBytes - Output byte cap.
 * @returns Validated graph output or a waiting interruption.
 * @throws The original graph, persistence, output, or cancellation error.
 * @example await runCompiledGraph(options, input, signal, id, trace, 1024);
 */
export function runCompiledGraph(
  options: GraphRuntimeOptions,
  input: unknown,
  signal: AbortSignal,
  invocationId: string,
  traceId: string,
  maxOutputBytes: number,
): Promise<unknown> {
  return Effect.runPromise(
    runCompiledGraphEffect(options, input, signal, invocationId, traceId, maxOutputBytes).pipe(
      Effect.catchTag("GraphInvocationFailure", (failure) =>
        Effect.fail(signal.aborted ? signalFailure(signal) : failure.cause),
      ),
    ),
    { signal },
  );
}

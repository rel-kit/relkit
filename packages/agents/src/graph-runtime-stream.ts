import { isInterrupted } from "@langchain/langgraph";
import { Effect, Exit } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { graphExecutionEffect } from "./define-graph.js";
import { resumeCommandEffect, waitingInterruptsEffect } from "./graph-continuation.js";
import type { GraphConfig } from "./graph-continuation.types.js";
import {
  GraphInterruptedError,
  graphWaitingResponse,
  publicWaitingRequests,
} from "./graph-interruption.js";
import { graphInvocationFailure } from "./graph-runtime-error.js";
import type { GraphRuntimeOptions } from "./graph-runtime.types.js";
import { collectNativeEventsEffect } from "./runtime-native-events.js";
import { selectedStateSchemasEffect } from "./runtime-state-schemas.js";
import { jsonValueEffect, validateValueEffect } from "./runtime-utils.js";
import { signalFailure, withSignal } from "./signal.js";
import type { compileGraph } from "./graph-compile.js";

/** Streams one compiled graph and validates its final public output.
 * @param options - Graph runtime and content sinks.
 * @param graph - Compiled native graph.
 * @param config - Persistent graph configuration.
 * @param input - Validated invocation input.
 * @param signal - Linked invocation cancellation signal.
 * @param maxOutputBytes - Maximum serialized output size.
 * @returns An Effect with graph output or GraphInvocationFailure.
 * @example await Effect.runPromise(streamCompiledGraphEffect(options, graph, config, input, signal, 1024));
 */
export const streamCompiledGraphEffect = Effect.fn("Agents.graph.streamCompiled")(
  function* (
    options: GraphRuntimeOptions,
    graph: ReturnType<typeof compileGraph>,
    config: GraphConfig,
    input: unknown,
    signal: AbortSignal,
    maxOutputBytes: number,
  ) {
    if (signal.aborted) return yield* Effect.fail(graphInvocationFailure(signalFailure(signal)));
    const nativeInput = options.resume
      ? yield* resumeCommandEffect(graph, options.agent, config, input).pipe(
          Effect.mapError((failure) => graphInvocationFailure(failure.cause)),
        )
      : input;
    const run = yield* Effect.tryPromise({
      try: () =>
        withSignal(
          graph.streamEvents(nativeInput, {
            version: "v3",
            signal,
            recursionLimit: options.agent.limits.maxSteps,
            ...config,
          }),
          signal,
        ),
      catch: graphInvocationFailure,
    });
    return yield* Effect.gen(function* () {
      const execution = yield* graphExecutionEffect(options.agent);
      const stateSchemas = yield* selectedStateSchemasEffect(
        [execution.state],
        options.agent.client?.state ?? [],
      ).pipe(Effect.mapError((failure) => graphInvocationFailure(failure.cause)));
      yield* collectNativeEventsEffect(
        run,
        options.contentSink,
        new Map(),
        new Set(),
        signal,
        options.agent.limits,
        stateSchemas,
        () => undefined,
        undefined,
        (reason) => run.abort(reason),
        options.agent.client?.events,
      ).pipe(Effect.mapError((failure) => graphInvocationFailure(failure.cause)));
      const state = yield* Effect.tryPromise({
        try: () => withSignal(run.output, signal),
        catch: graphInvocationFailure,
      });
      if (isInterrupted(state)) {
        const interrupts = yield* waitingInterruptsEffect(graph, options.agent, config).pipe(
          Effect.mapError((failure) => graphInvocationFailure(failure.cause)),
        );
        yield* Effect.tryPromise({
          try: () =>
            withSignal(
              options.contentSink?.emitWaiting?.(
                {
                  response: graphWaitingResponse(interrupts),
                  requests: publicWaitingRequests(interrupts),
                },
                signal,
              ),
              signal,
            ),
          catch: graphInvocationFailure,
        });
        return yield* Effect.fail(
          graphInvocationFailure(new GraphInterruptedError(options.threadId!, interrupts)),
        );
      }
      const validated = yield* validateValueEffect(options.agent.output, state, "output").pipe(
        Effect.mapError((failure) => graphInvocationFailure(failure.cause)),
      );
      const output = yield* jsonValueEffect(validated, maxOutputBytes, "graph output").pipe(
        Effect.mapError((failure) => graphInvocationFailure(failure.cause)),
      );
      yield* Effect.tryPromise({
        try: () => withSignal(options.contentSink?.emitOutput(output, signal), signal),
        catch: graphInvocationFailure,
      });
      yield* Effect.tryPromise({
        try: () => withSignal(options.contentSink?.finishOutput?.(signal), signal),
        catch: graphInvocationFailure,
      });
      return output;
    }).pipe(
      Effect.onExit((exit) =>
        Exit.isFailure(exit)
          ? Effect.sync(() => {
              try {
                run.abort(signalFailure(signal));
              } catch {}
            })
          : Effect.void,
      ),
    );
  },
  (effect) => observeAgent("graph.stream-compiled", effect),
);

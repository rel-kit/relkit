/**
 * Collects graph state, waiting requests and validated output from an already
 * acquired native stream. Its caller retains stream abort/finalization ownership.
 */
import { isInterrupted } from "@langchain/langgraph";
import { Effect } from "effect";
import { graphExecutionEffect } from "./define-graph.js";
import { waitingInterruptsEffect } from "./graph-continuation.js";
import {
  GraphInterruptedError,
  graphWaitingResponse,
  publicWaitingRequests,
} from "./graph-interruption.js";
import { graphInvocationFailure } from "./graph-runtime-error.js";
import { collectNativeEventsEffect } from "./runtime-native-events.js";
import { selectedStateSchemasEffect } from "./runtime-state-schemas.js";
import { jsonValueEffect, validateValueEffect } from "./runtime-utils.js";
import { withSignal } from "./signal.js";
import type { CompiledGraphStreamContext } from "./graph-runtime-stream.types.js";

/** Collects the original native events before settling public graph state.
 * @param context - Already acquired stream, graph and cancellation owner.
 * @returns Validated output or the same interruption/failure.
 */
export const collectCompiledGraphStateEffect = Effect.fn("Agents.graph.collectStream")(function* (
  context: CompiledGraphStreamContext,
) {
  const { options, graph, config, signal, run } = context;
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
  return yield* settleCompiledGraphStateEffect(context, state);
});

/** Emits waiting data or final validated state using the original byte limits.
 * @param context - Existing graph execution owner.
 * @param state - Native final graph state awaiting validation.
 * @returns Validated output or graph interruption.
 */
const settleCompiledGraphStateEffect = Effect.fn("Agents.graph.settleStream")(function* (
  context: CompiledGraphStreamContext,
  state: unknown,
) {
  const { options, signal, maxOutputBytes } = context;
  if (isInterrupted(state)) return yield* emitCompiledGraphWaitingEffect(context);
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
});

/** Publishes interruption requests before returning the original waiting failure.
 * @param context - Existing graph checkpoint identity and sink.
 * @returns The original tagged graph interruption.
 */
const emitCompiledGraphWaitingEffect = Effect.fn("Agents.graph.emitWaiting")(function* (
  context: CompiledGraphStreamContext,
) {
  const { options, graph, config, signal } = context;
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
});

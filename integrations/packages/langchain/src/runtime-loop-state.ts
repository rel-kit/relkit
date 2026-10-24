/**
 * Streams one already acquired native runnable and settles its public output or
 * interruption using the same checkpoint identity, byte limits and content sink.
 */
import { isInterrupted } from "@langchain/langgraph";
import { collectNativeEvents } from "./runtime-native-events.js";
import { selectedStateSchemas } from "./runtime-state-schemas.js";
import {
  nativeAgentResumeCommand,
  nativeAgentWaitingInterrupts,
} from "./native-agent-interruption.js";
import {
  GraphInterruptedError,
  graphWaitingResponse,
  publicWaitingRequests,
} from "./graph-interruption.js";
import { jsonValue, validateValue, withSignal } from "./runtime-utils.js";
import { nativeMessages, responseValue } from "./runtime-loop-values.js";
import type { NativeAgentLoopContext } from "./runtime-loop-context.types.js";

/** Collects the native stream under its caller's existing trace and signal.
 * @param context - Runnable and per-invocation dependencies.
 * @returns The native final state after stream collection.
 */
export async function streamNativeAgentLoop(context: NativeAgentLoopContext) {
  const { options, native, config, input, signal, maxInputBytes, observe } = context;
  if (options.resume && options.threadId === undefined) {
    throw new TypeError("Agent resume requires threadId");
  }
  const nativeInput = options.resume
    ? await nativeAgentResumeCommand(native.agent, config, input)
    : { messages: nativeMessages(options, input, maxInputBytes) };
  const run = await withSignal(
    native.agent.streamEvents(nativeInput, {
      version: "v3",
      signal,
      ...config,
    }),
    signal,
  );
  await collectNativeEvents(
    run,
    options.contentSink,
    native.tools.publicIds,
    native.tools.relkitNames,
    signal,
    options.agent.limits,
    selectedStateSchemas(
      options.agent.middleware.map((middleware) => middleware.stateSchema),
      options.agent.client?.state ?? [],
    ),
    native.tools.failure,
    observe,
    (reason) => run.abort(reason),
    options.agent.client?.events,
  );
  return withSignal(run.output, signal);
}

/** Publishes waiting state or validated output without changing persistence identity.
 * @param context - Existing runnable, checkpoint config and content sink.
 * @param state - Native final state before public output validation.
 * @returns Validated output, or the existing graph interruption error.
 */
export async function settleNativeAgentLoop(context: NativeAgentLoopContext, state: unknown) {
  const { options, native, config, signal, maxOutputBytes } = context;
  if (isInterrupted(state)) {
    if (options.threadId === undefined) {
      throw new TypeError("Agent interruption requires threadId");
    }
    const interrupts = await nativeAgentWaitingInterrupts(native.agent, config);
    await withSignal(
      options.contentSink?.emitWaiting?.(
        {
          response: graphWaitingResponse(interrupts),
          requests: publicWaitingRequests(interrupts),
        },
        signal,
      ),
      signal,
    );
    throw new GraphInterruptedError(options.threadId, interrupts);
  }
  const output = await validateValue(
    options.agent.output,
    jsonValue(responseValue(state), maxOutputBytes, "agent output"),
    "output",
  );
  if (options.contentSink !== undefined) {
    await withSignal(options.contentSink.emitOutput(output, signal), signal);
    await withSignal(options.contentSink.finishOutput?.(signal), signal);
  }
  return output;
}

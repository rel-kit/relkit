import { frameworkTrace } from "@relkit/invocation";
import { isInterrupted } from "@langchain/langgraph";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { AgentCapturePolicy } from "./observability.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { createLoopTelemetry } from "./runtime-loop-telemetry.js";
import { collectNativeEvents } from "./runtime-native-events.js";
import { createNativeAgent, StructuredOutputParsingError } from "./runtime-native-agent.js";
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
import {
  jsonValue,
  modelFailure,
  signalFailure,
  validateValue,
  withSignal,
} from "./runtime-utils.js";
import type { AgentDescriptor } from "./define-agent.js";
import { nativeMessages, responseValue, unwrapNativeCause } from "./runtime-loop-values.js";
import type { AgentLoopOptions, NativeModel } from "./runtime-loop.types.js";

export type { AgentLoopOptions, NativeModel } from "./runtime-loop.types.js";

/** Runs one native model loop with linked Effect cancellation.
 * @param options - Runtime and invocation integrations.
 * @param model - Resolved native model.
 * @param modelId - Stable model identity.
 * @param signal - Invocation cancellation signal.
 * @param input - Validated invocation input.
 * @param maxInputBytes - Input byte cap.
 * @param maxOutputBytes - Output byte cap.
 * @param invocationId - Stable invocation identity.
 * @param traceId - Trace identity.
 * @param capture - Capture policy.
 * @returns An Effect with validated output or AgentInvocationFailure.
 * @example await Effect.runPromise(runAgentLoopEffect(options, model, id, signal, input, 1024, 1024, invocation, trace, capture));
 */
export const runAgentLoopEffect = Effect.fn("Agents.runtime.runLoop")(
  (
    options: AgentLoopOptions,
    model: NativeModel,
    modelId: string,
    signal: AbortSignal,
    input: unknown,
    maxInputBytes: number,
    maxOutputBytes: number,
    invocationId: string,
    traceId: string,
    capture: AgentCapturePolicy,
  ) =>
    Effect.tryPromise({
      try: (effectSignal) =>
        runAgentLoopCore(
          options,
          model,
          modelId,
          AbortSignal.any([signal, effectSignal]),
          input,
          maxInputBytes,
          maxOutputBytes,
          invocationId,
          traceId,
          capture,
        ),
      catch: agentInvocationFailure,
    }),
  (effect) => observeAgent("runtime.run-loop", effect),
);

/** Runs the native model loop for existing Promise callers.
 * @param options - Runtime and invocation integrations.
 * @param model - Resolved native model.
 * @param modelId - Stable model identity.
 * @param signal - Invocation cancellation signal.
 * @param input - Validated invocation input.
 * @param maxInputBytes - Input byte cap.
 * @param maxOutputBytes - Output byte cap.
 * @param invocationId - Stable invocation identity.
 * @param traceId - Trace identity.
 * @param capture - Capture policy.
 * @returns Validated output.
 * @throws The original model, tool, validation, or cancellation error.
 * @example await runAgentLoop(options, model, id, signal, input, 1024, 1024, invocation, trace, capture);
 */
export function runAgentLoop(
  options: AgentLoopOptions,
  model: NativeModel,
  modelId: string,
  signal: AbortSignal,
  input: unknown,
  maxInputBytes: number,
  maxOutputBytes: number,
  invocationId: string,
  traceId: string,
  capture: AgentCapturePolicy,
): Promise<unknown> {
  return Effect.runPromise(
    runAgentLoopEffect(
      options,
      model,
      modelId,
      signal,
      input,
      maxInputBytes,
      maxOutputBytes,
      invocationId,
      traceId,
      capture,
    ).pipe(Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause))),
  );
}

async function runAgentLoopCore(
  options: AgentLoopOptions,
  model: NativeModel,
  modelId: string,
  signal: AbortSignal,
  input: unknown,
  maxInputBytes: number,
  maxOutputBytes: number,
  invocationId: string,
  traceId: string,
  capture: AgentCapturePolicy,
): Promise<unknown> {
  const native = await createNativeAgent({
    runtime: {
      ...options,
      agent: options.agent as AgentDescriptor<string, unknown, unknown>,
    },
    model,
    signal,
    maxOutputBytes,
    invocationId,
    traceId,
  });
  const observe = createLoopTelemetry(options, modelId);
  const config =
    options.threadId === undefined ? {} : { configurable: { thread_id: options.threadId } };
  try {
    const state = await frameworkTrace.span(
      `relkit.agent.${options.agent.id}.model`,
      {
        input,
        kind: "client",
        attributes: { "relkit.agent.id": options.agent.id, "relkit.model.id": modelId },
      },
      async () => {
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
      },
    );
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
  } catch (cause) {
    const nativeCause = unwrapNativeCause(cause);
    if (signal.aborted) throw signalFailure(signal);
    if (native.tools.failure() !== undefined) throw native.tools.failure();
    if (nativeCause instanceof AgentRuntimeError) throw nativeCause;
    if (nativeCause instanceof GraphInterruptedError) throw nativeCause;
    if (nativeCause instanceof StructuredOutputParsingError) {
      throw new AgentRuntimeError("RELKIT_AGENT_OUTPUT_VALIDATION", "Output validation failed");
    }
    throw modelFailure(nativeCause, signal);
  }
}

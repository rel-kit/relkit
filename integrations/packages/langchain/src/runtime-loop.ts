/**
 * Exposes native loop execution as an observed Effect and Promise facade.
 * Cancellation remains linked to the caller and the native stream owner.
 */
import { runAgentLoopCore } from "./runtime-loop-execution.js";
import { Effect } from "effect";
import { observeAgent } from "@relkit/agents/internal/agent-telemetry";
import type { AgentCapturePolicy } from "@relkit/agents/internal/observability";
import { agentInvocationFailure } from "./runtime-effect-error.js";
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

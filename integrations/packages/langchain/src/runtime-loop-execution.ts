/**
 * Executes one native agent stream while retaining model failure precedence.
 * Public wrappers own Effect interruption; state helpers use the same signal.
 */
import { frameworkTrace } from "@relkit/invocation";
import type { AgentCapturePolicy } from "@relkit/agents/internal/observability";
import { AgentRuntimeError } from "./runtime-errors.js";
import { createLoopTelemetry } from "./runtime-loop-telemetry.js";
import { createNativeAgent, StructuredOutputParsingError } from "./runtime-native-agent.js";
import { GraphInterruptedError } from "./graph-interruption.js";
import { modelFailure, signalFailure } from "./runtime-utils.js";
import type { AgentDescriptor } from "./define-agent.js";
import { unwrapNativeCause } from "./runtime-loop-values.js";
import type { AgentLoopOptions, NativeModel } from "./runtime-loop.types.js";
import { streamNativeAgentLoop, settleNativeAgentLoop } from "./runtime-loop-state.js";

export async function runAgentLoopCore(
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
  const context = {
    options,
    native,
    config,
    input,
    signal,
    maxInputBytes,
    maxOutputBytes,
    observe,
  };
  try {
    const state = await frameworkTrace.span(
      `relkit.agent.${options.agent.id}.model`,
      {
        input,
        kind: "client",
        attributes: { "relkit.agent.id": options.agent.id, "relkit.model.id": modelId },
      },
      () => streamNativeAgentLoop(context),
    );
    return settleNativeAgentLoop(context, state);
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

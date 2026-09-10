import { frameworkTrace } from "@relkit/invocation";
import { isInterrupted } from "@langchain/langgraph";
import type { AgentCapturePolicy } from "./observability.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";
import { AgentRuntimeError } from "./runtime-errors.js";
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

type AgentOptions = AgentRuntimeOptions & AgentInvocationOptions;
type NativeModel = string | import("@langchain/core/language_models/base").LanguageModelLike;

export async function runAgentLoop(
  options: AgentOptions,
  model: NativeModel,
  _modelId: string,
  signal: AbortSignal,
  input: unknown,
  maxInputBytes: number,
  maxOutputBytes: number,
  invocationId: string,
  traceId: string,
  _capture: AgentCapturePolicy,
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
  const observe = createLoopTelemetry(options, _modelId);
  const config =
    options.threadId === undefined ? {} : { configurable: { thread_id: options.threadId } };
  try {
    const state = await frameworkTrace.span(
      `relkit.agent.${options.agent.id}.model`,
      {
        input,
        kind: "client",
        attributes: { "relkit.agent.id": options.agent.id, "relkit.model.id": _modelId },
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

function nativeMessages(options: AgentOptions, input: unknown, maxInputBytes: number) {
  return [
    ...(options.messages ?? []).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: "user" as const,
      content: JSON.stringify(jsonValue(input, maxInputBytes, "agent input")),
    },
  ];
}

function responseValue(state: unknown): unknown {
  if (
    !isRecord(state) ||
    !isRecord(state.structuredResponse) ||
    !("value" in state.structuredResponse)
  ) {
    throw new AgentRuntimeError(
      "RELKIT_AGENT_OUTPUT_VALIDATION",
      "Structured output is unavailable",
    );
  }
  return state.structuredResponse.value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unwrapNativeCause(value: unknown): unknown {
  const seen = new Set<unknown>();
  let current = value;
  while (isRecord(current) && current.cause !== undefined && !seen.has(current.cause)) {
    seen.add(current);
    current = current.cause;
  }
  return current;
}

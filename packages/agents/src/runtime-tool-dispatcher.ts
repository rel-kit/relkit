import {
  currentExecutionContext, resolveDescriptorIdentity, type InvocationDispatchRequest,
  type InvocationDispatcher,
} from "@relkit/invocation";
import type { ToolEngine, ToolEngineInvocation } from "@relkit/tools";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { RuntimeToolOptions } from "./runtime-tool-events.types.js";

/** Creates a nested function dispatcher with stable agent parent context.
 * @param engine - Function tool engine.
 * @param options - Runtime invocation options.
 * @param invocationId - Current agent invocation identity.
 * @param traceId - Optional trace identity.
 * @param parentSpanId - Optional parent span identity.
 * @param signal - Invocation cancellation signal.
 * @returns An Effect with a frozen dispatcher and no expected failure.
 * @example Effect.runSync(createAgentInvocationDispatcherEffect(engine, options, id, trace, span, signal));
 */
export const createAgentInvocationDispatcherEffect = Effect.fn("Agents.runtime.createToolDispatcher")((
  engine: ToolEngine,
  options: RuntimeToolOptions,
  invocationId: string,
  traceId: string | undefined,
  parentSpanId: string | undefined,
  signal: AbortSignal,
) => Effect.sync(() => {
  const active = currentExecutionContext();
  const parent = {
    id: invocationId,
    traceId: active?.span.traceId ?? traceId ?? invocationId,
    signal,
    ...(active?.span.spanId === undefined && parentSpanId === undefined
      ? {}
      : { spanId: active?.span.spanId ?? parentSpanId }),
  };
  return Object.freeze({
    dispatch: <Input, Output, Context extends { readonly signal: AbortSignal }>(
      request: InvocationDispatchRequest<Input, Output, Context>,
    ) => {
      const target = request.target;
      const invocation = {
        functionId: resolveDescriptorIdentity(target).id,
        input: request.input,
        source: "tool" as const,
        inputSchema: target.input,
        outputSchema: target.output,
        ...(target.errors === undefined
          ? {}
          : { errors: target.errors as NonNullable<ToolEngineInvocation["errors"]> }),
        ...(request.options?.timeoutMs === undefined
          ? {}
          : { timeoutMs: request.options.timeoutMs }),
        signal: request.options?.signal ?? signal,
        ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
        ...(request.options?.toolHooks === undefined
          ? {}
          : { toolHooks: request.options.toolHooks }),
        ...(request.options?.progressSink === undefined
          ? {}
          : { progressSink: request.options.progressSink }),
        parent,
      } satisfies ToolEngineInvocation;
      return engine.invoke(invocation) as Promise<Output>;
    },
  }) satisfies InvocationDispatcher;
}), (effect) => observeAgent("runtime.create-tool-dispatcher", effect));

/** Creates a nested function dispatcher for existing synchronous callers.
 * @param engine - Function tool engine.
 * @param options - Runtime invocation options.
 * @param invocationId - Current agent invocation identity.
 * @param traceId - Optional trace identity.
 * @param parentSpanId - Optional parent span identity.
 * @param signal - Invocation cancellation signal.
 * @returns A frozen dispatcher.
 * @example createAgentInvocationDispatcher(engine, options, id, trace, span, signal);
 */
export function createAgentInvocationDispatcher(
  engine: ToolEngine,
  options: RuntimeToolOptions,
  invocationId: string,
  traceId: string | undefined,
  parentSpanId: string | undefined,
  signal: AbortSignal,
): InvocationDispatcher {
  return Effect.runSync(createAgentInvocationDispatcherEffect(
    engine, options, invocationId, traceId, parentSpanId, signal,
  ));
}

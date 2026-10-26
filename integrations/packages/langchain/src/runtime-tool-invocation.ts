/**
 * Executes a validated tool in the original invocation scope and emits terminal
 * lifecycle records without changing approval or progress routing.
 */
import {
  currentInvocationScope,
  runInInvocationScope,
  type InvocationDispatcher,
  type InvocationDispatchRequest,
} from "@relkit/invocation";
import type { ToolDescriptor, ToolEngine, ToolEngineInvocation } from "@relkit/tools";
import { Effect } from "effect";
import { ApprovalDeniedError } from "@relkit/agents/internal/approval";
import { agentInvocationFailure, type AgentInvocationFailure } from "./runtime-effect-error.js";
import { createAgentInvocationDispatcherEffect } from "./runtime-tool-dispatcher.js";
import { emitToolEffect, resolveAgentApproval } from "./runtime-tool-events.js";
import type { RuntimeToolOptions } from "./runtime-tool-events.types.js";
import type { AgentToolCall } from "./runtime-tools.types.js";

/** Dispatches a checked tool inside its existing call scope.
 * @param engine - Common function engine.
 * @param tool - Validated descriptor.
 * @param turn - Tool-call identity.
 * @param options - Runtime callbacks and approval policy.
 * @param signal - Linked caller cancellation.
 * @param invocationId - Current invocation.
 * @param traceId - Optional trace identity.
 * @param parentSpanId - Optional parent span.
 * @param progressSink - Tool-scoped progress destination.
 * @returns Validated result or the original invocation failure.
 */
export const invokeRegisteredAgentToolEffect = Effect.fn("Agents.runtime.dispatchTool")(
  function* (
    engine: ToolEngine,
    tool: ToolDescriptor<string>,
    turn: AgentToolCall,
    options: RuntimeToolOptions,
    signal: AbortSignal,
    invocationId: string,
    traceId: string | undefined,
    parentSpanId: string | undefined,
    progressSink: ToolEngineInvocation["progressSink"],
  ) {
    const current = yield* Effect.sync(() => currentInvocationScope());
    const baseDispatcher =
      current?.dispatcher ??
      (yield* createAgentInvocationDispatcherEffect(
        engine,
        options,
        invocationId,
        traceId,
        parentSpanId,
        signal,
      ));
    const dispatcher =
      progressSink === undefined ? baseDispatcher : withProgressSink(baseDispatcher, progressSink);
    const result = yield* Effect.tryPromise({
      try: (effectSignal) => {
        const combined = AbortSignal.any([signal, effectSignal]);
        return Promise.resolve(
          runInInvocationScope(
            current === undefined
              ? {
                  dispatcher,
                  parent: {
                    id: invocationId,
                    traceId: traceId ?? invocationId,
                    signal: combined,
                    ...(parentSpanId === undefined ? {} : { spanId: parentSpanId }),
                  },
                }
              : { ...current, dispatcher },
            () =>
              tool.invoke(turn.input, {
                signal: combined,
                approval: (request) =>
                  resolveAgentApproval(options, request, turn.callId, invocationId, combined),
              }),
          ),
        );
      },
      catch: agentInvocationFailure,
    });
    yield* emitToolEffect(options, turn, "succeeded", result, signal);
    return result;
  },
  (effect, _engine, _tool, turn, options, signal) =>
    effect.pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) =>
        emitToolFailure(options, turn, signal, failure),
      ),
    ),
);

/** Reports terminal state before propagating the unchanged failure.
 * @param options - Content sink.
 * @param turn - Tool-call identity.
 * @param signal - Invocation signal.
 * @param failure - Original tagged failure.
 * @returns The original failure after best-effort terminal reporting.
 */
function emitToolFailure(
  options: RuntimeToolOptions,
  turn: AgentToolCall,
  signal: AbortSignal,
  failure: AgentInvocationFailure,
) {
  return Effect.gen(function* () {
    const state = failure.cause instanceof ApprovalDeniedError ? "denied" : "failed";
    yield* emitToolEffect(options, turn, state, undefined, signal).pipe(
      Effect.catchTag("AgentInvocationFailure", () => Effect.void),
    );
    return yield* Effect.fail(failure);
  });
}

function withProgressSink(
  dispatcher: InvocationDispatcher,
  progressSink: NonNullable<ToolEngineInvocation["progressSink"]>,
): InvocationDispatcher {
  const scoped: InvocationDispatcher = {
    dispatch: <Input, Output, Context extends { readonly signal: AbortSignal }>(
      request: InvocationDispatchRequest<Input, Output, Context>,
    ): Promise<Output> =>
      dispatcher.dispatch({
        ...request,
        options: { ...request.options, progressSink },
      }),
  };
  return Object.freeze(scoped);
}

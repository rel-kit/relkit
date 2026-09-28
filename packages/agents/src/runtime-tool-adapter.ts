import {
  currentInvocationScope,
  runInInvocationScope,
  type InvocationDispatchRequest,
  type InvocationDispatcher,
} from "@relkit/invocation";
import { validate } from "@relkit/schema";
import type { ToolDescriptor, ToolEngine, ToolEngineInvocation } from "@relkit/tools";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { ApprovalDeniedError } from "./approval.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { signalFailure } from "./signal.js";
import { createAgentInvocationDispatcherEffect } from "./runtime-tool-dispatcher.js";
import { emitToolEffect, resolveAgentApproval } from "./runtime-tool-events.js";
import type { RuntimeToolOptions } from "./runtime-tool-events.types.js";
import type { AgentToolCall } from "./runtime-tools.types.js";

export {
  createAgentInvocationDispatcher,
  createAgentInvocationDispatcherEffect,
} from "./runtime-tool-dispatcher.js";

/** Invokes an allowed tool with validated input and public lifecycle events.
 * @param engine - Function tool engine.
 * @param tool - Registered tool descriptor.
 * @param turn - Requested tool call.
 * @param options - Runtime and invocation integrations.
 * @param signal - Invocation cancellation signal.
 * @param invocationId - Current invocation identity.
 * @param traceId - Optional trace identity.
 * @param parentSpanId - Optional parent span identity.
 * @returns An Effect with the tool result or AgentInvocationFailure.
 * @example await Effect.runPromise(invokeAgentToolEffect(engine, tool, turn, options, signal, id));
 */
export const invokeAgentToolEffect = Effect.fn("Agents.runtime.invokeTool")(
  function* (
    engine: ToolEngine,
    tool: ToolDescriptor<string>,
    turn: AgentToolCall,
    options: RuntimeToolOptions,
    signal: AbortSignal,
    invocationId: string,
    traceId?: string,
    parentSpanId?: string,
  ) {
    if (signal.aborted) return yield* Effect.fail(agentInvocationFailure(signalFailure(signal)));
    const parsed = yield* Effect.tryPromise({
      try: () => Promise.resolve(validate(tool.target.input, turn.input as never)),
      catch: agentInvocationFailure,
    });
    if (!("value" in parsed)) {
      return yield* Effect.fail(
        agentInvocationFailure(
          new AgentRuntimeError("RELKIT_AGENT_INPUT_VALIDATION", "Tool input validation failed"),
        ),
      );
    }
    yield* emitToolEffect(options, turn, "started", undefined, signal);
    yield* emitToolEffect(options, turn, "input-ready", parsed.value, signal);
    const approvalRequired =
      tool.approval === "always" || (tool.approval === "on-write" && tool.sideEffect === "write");
    if (!approvalRequired) yield* emitToolEffect(options, turn, "running", undefined, signal);
    const progressSink = yield* Effect.try({
      try: () =>
        options.contentSink?.progressSinkForTool?.({
          toolCallId: turn.callId,
          toolId: turn.toolId,
        }),
      catch: agentInvocationFailure,
    });
    const outcome = yield* Effect.gen(function* () {
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
        progressSink === undefined
          ? baseDispatcher
          : withProgressSink(baseDispatcher, progressSink);
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
    }).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) =>
        Effect.gen(function* () {
          const state = failure.cause instanceof ApprovalDeniedError ? "denied" : "failed";
          yield* emitToolEffect(options, turn, state, undefined, signal).pipe(
            Effect.catchTag("AgentInvocationFailure", () => Effect.void),
          );
          return yield* Effect.fail(failure);
        }),
      ),
    );
    return outcome;
  },
  (effect) => observeAgent("runtime.invoke-tool", effect),
);

/** Invokes an allowed tool for existing Promise callers.
 * @param engine - Function tool engine.
 * @param tool - Registered tool descriptor.
 * @param turn - Requested tool call.
 * @param options - Runtime and invocation integrations.
 * @param signal - Invocation cancellation signal.
 * @param invocationId - Current invocation identity.
 * @param traceId - Optional trace identity.
 * @param parentSpanId - Optional parent span identity.
 * @returns A Promise of the tool result.
 * @throws The original validation, sink, approval, or tool error.
 * @example await invokeAgentTool(engine, tool, turn, options, signal, id);
 */
export function invokeAgentTool(
  engine: ToolEngine,
  tool: ToolDescriptor<string>,
  turn: AgentToolCall,
  options: RuntimeToolOptions,
  signal: AbortSignal,
  invocationId: string,
  traceId?: string,
  parentSpanId?: string,
): Promise<unknown> {
  return Effect.runPromise(
    invokeAgentToolEffect(
      engine,
      tool,
      turn,
      options,
      signal,
      invocationId,
      traceId,
      parentSpanId,
    ).pipe(Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause))),
    { signal },
  );
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

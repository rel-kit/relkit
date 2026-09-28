import { frameworkTrace } from "@relkit/invocation";
import type { ToolApprovalRequest } from "@relkit/tools";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import {
  approveApprovalEffect,
  assertApprovalGrantedEffect,
  createApprovalEffect,
  denyApprovalEffect,
} from "./approval.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { signalFailure } from "./signal.js";
import type { RuntimeToolOptions } from "./runtime-tool-events.types.js";
import type { AgentToolCall } from "./runtime-tools.types.js";
import type { ToolPartState } from "./state.types.js";

/** Emits a public tool transition with linked Effect cancellation.
 * @param options - Runtime content sink.
 * @param turn - Tool and call identities.
 * @param state - Transition state.
 * @param value - Optional public value.
 * @param signal - Invocation cancellation signal.
 * @returns An Effect with void or AgentInvocationFailure.
 * @example await Effect.runPromise(emitToolEffect(options, turn, "running", undefined, signal));
 */
export const emitToolEffect = Effect.fn("Agents.runtime.emitTool")(
  (
    options: RuntimeToolOptions,
    turn: Pick<AgentToolCall, "callId" | "toolId">,
    state: ToolPartState,
    value: unknown,
    signal: AbortSignal,
  ) =>
    Effect.gen(function* () {
      const emit = options.contentSink?.emitTool;
      if (emit === undefined) return;
      if (signal.aborted) return yield* Effect.fail(agentInvocationFailure(signalFailure(signal)));
      yield* Effect.tryPromise({
        try: (effectSignal) =>
          Promise.resolve(
            emit(
              {
                toolCallId: turn.callId,
                toolId: turn.toolId,
                state,
                ...(value === undefined ? {} : { value }),
              },
              AbortSignal.any([signal, effectSignal]),
            ),
          ),
        catch: agentInvocationFailure,
      });
    }),
  (effect) => observeAgent("runtime.emit-tool", effect),
);

/** Emits a tool transition for existing Promise callers.
 * @param options - Runtime content sink.
 * @param turn - Tool and call identities.
 * @param state - Transition state.
 * @param value - Optional public value.
 * @param signal - Invocation cancellation signal.
 * @returns A Promise that resolves after the sink completes.
 * @throws The original sink or cancellation error.
 * @example await emitTool(options, turn, "running", undefined, signal);
 */
export function emitTool(
  options: RuntimeToolOptions,
  turn: Pick<AgentToolCall, "callId" | "toolId">,
  state: ToolPartState,
  value: unknown,
  signal: AbortSignal,
): Promise<void> {
  return Effect.runPromise(
    emitToolEffect(options, turn, state, value, signal).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    ),
    { signal },
  );
}

/** Resolves tool approval and emits its lifecycle transitions.
 * @param options - Runtime approval handler and sink.
 * @param request - Tool approval request.
 * @param toolCallId - Tool call identity.
 * @param invocationId - Invocation identity.
 * @param signal - Invocation cancellation signal.
 * @returns An Effect with true or AgentInvocationFailure.
 * @example await Effect.runPromise(resolveAgentApprovalEffect(options, request, callId, id, signal));
 */
export const resolveAgentApprovalEffect = Effect.fn("Agents.runtime.resolveApproval")(
  function* (
    options: RuntimeToolOptions,
    request: ToolApprovalRequest,
    toolCallId: string,
    invocationId: string,
    signal: AbortSignal,
  ) {
    if (signal.aborted) return yield* Effect.fail(agentInvocationFailure(signalFailure(signal)));
    const approval = yield* createApprovalEffect({
      invocationId,
      toolCallId,
      toolId: request.toolId,
      sideEffect: request.sideEffect,
      policy: request.policy,
    }).pipe(Effect.mapError((failure) => agentInvocationFailure(failure.cause)));
    if (approval.state !== "pending") return true as const;
    const turn = { callId: toolCallId, toolId: request.toolId };
    yield* emitToolEffect(options, turn, "approval-required", undefined, signal);
    yield* Effect.sync(() =>
      frameworkTrace.event("agent.tool.approval.requested", {
        "relkit.tool.id": request.toolId,
        "relkit.tool.call.id": toolCallId,
      }),
    );
    const handler = options.approval;
    if (handler === undefined) {
      yield* assertApprovalGrantedEffect(approval).pipe(
        Effect.mapError((failure) => agentInvocationFailure(failure.cause)),
      );
      return true as const;
    }
    const response = yield* Effect.tryPromise({
      try: () => Promise.resolve(handler(approval)),
      catch: agentInvocationFailure,
    });
    const decision =
      response === "approved" || response === true
        ? yield* approveApprovalEffect(approval).pipe(
            Effect.mapError((failure) => agentInvocationFailure(failure.cause)),
          )
        : response === "denied" || response === false
          ? yield* denyApprovalEffect(approval).pipe(
              Effect.mapError((failure) => agentInvocationFailure(failure.cause)),
            )
          : response;
    yield* Effect.sync(() =>
      frameworkTrace.event("agent.tool.approval.resolved", {
        "relkit.tool.id": request.toolId,
        "relkit.tool.call.id": toolCallId,
        "relkit.tool.approval": decision.state,
      }),
    );
    yield* emitToolEffect(
      options,
      turn,
      decision.state === "approved" ? "running" : "denied",
      undefined,
      signal,
    );
    yield* assertApprovalGrantedEffect(decision).pipe(
      Effect.mapError((failure) => agentInvocationFailure(failure.cause)),
    );
    return true as const;
  },
  (effect) => observeAgent("runtime.resolve-approval", effect),
);

/** Resolves approval for existing Promise callers.
 * @param options - Runtime approval handler and sink.
 * @param request - Tool approval request.
 * @param toolCallId - Tool call identity.
 * @param invocationId - Invocation identity.
 * @param signal - Invocation cancellation signal.
 * @returns A Promise of true for an approved call.
 * @throws The original approval, sink, or cancellation error.
 * @example await resolveAgentApproval(options, request, callId, id, signal);
 */
export function resolveAgentApproval(
  options: RuntimeToolOptions,
  request: ToolApprovalRequest,
  toolCallId: string,
  invocationId: string,
  signal: AbortSignal,
): Promise<true> {
  return Effect.runPromise(
    resolveAgentApprovalEffect(options, request, toolCallId, invocationId, signal).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    ),
    { signal },
  );
}

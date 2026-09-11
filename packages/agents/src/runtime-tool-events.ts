import { frameworkTrace } from "@relkit/invocation";
import type { ToolApprovalRequest } from "@relkit/tools";
import {
  assertApprovalGranted,
  approveApproval,
  createApproval,
  denyApproval,
  type ApprovalRecord,
} from "./approval.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";
import type { AgentToolCall } from "./runtime-tools.js";
import type { ToolPartState } from "./state-types.js";
import { withSignal } from "./runtime-utils.js";

type RuntimeOptions = AgentRuntimeOptions & AgentInvocationOptions;

export async function emitTool(
  options: RuntimeOptions,
  turn: Pick<AgentToolCall, "callId" | "toolId">,
  state: ToolPartState,
  value: unknown,
  signal: AbortSignal,
): Promise<void> {
  const emit = options.contentSink?.emitTool;
  if (emit === undefined) return;
  await withSignal(
    emit(
      {
        toolCallId: turn.callId,
        toolId: turn.toolId,
        state,
        ...(value === undefined ? {} : { value }),
      },
      signal,
    ),
    signal,
  );
}

export async function resolveAgentApproval(
  options: RuntimeOptions,
  request: ToolApprovalRequest,
  toolCallId: string,
  invocationId: string,
  signal: AbortSignal,
): Promise<true> {
  const approval = createApproval({
    invocationId,
    toolCallId,
    toolId: request.toolId,
    sideEffect: request.sideEffect,
    policy: request.policy,
  });
  if (approval.state !== "pending") return true;
  const turn = { callId: toolCallId, toolId: request.toolId };
  await emitTool(options, turn, "approval-required", undefined, signal);
  frameworkTrace.event("agent.tool.approval.requested", {
    "relkit.tool.id": request.toolId,
    "relkit.tool.call.id": toolCallId,
  });
  const handler = options.approval;
  if (handler === undefined) {
    assertApprovalGranted(approval);
    return true;
  }
  const response = await withSignal(handler(approval), signal);
  const decision: ApprovalRecord =
    response === "approved" || response === true
      ? approveApproval(approval)
      : response === "denied" || response === false
        ? denyApproval(approval)
        : response;
  frameworkTrace.event("agent.tool.approval.resolved", {
    "relkit.tool.id": request.toolId,
    "relkit.tool.call.id": toolCallId,
    "relkit.tool.approval": decision.state,
  });
  await emitTool(
    options,
    turn,
    decision.state === "approved" ? "running" : "denied",
    undefined,
    signal,
  );
  assertApprovalGranted(decision);
  return true;
}

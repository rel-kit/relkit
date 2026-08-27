import { PROTOCOL_VERSION } from "@relkit/contracts";
import { safeJson, type ResolvedActiveGeneration } from "./shared.js";
import { InspectorActionError } from "./actions-errors.js";
import { ACTION_REDACTION, projectAdmin, projectApproval } from "./actions-projection.js";
import { assertActionState, assertProtocol, bounded, reason } from "./actions-utils.js";
import type {
  InspectorActionRequest,
  InspectorActionServices,
  InspectorEventActionRequest,
  InspectorFunctionActionRequest,
  InspectorJobActionRequest,
  InspectorToolApprovalRequest,
} from "./actions.js";

export async function dispatchInspectorAction(
  request: InspectorActionRequest,
  generation: ResolvedActiveGeneration,
  actions: InspectorActionServices,
): Promise<Record<string, unknown>> {
  if (request.action === "function.invoke") {
    const service = actions.functions;
    const invoke = service?.invoke ?? actions.invokeFunction;
    if (invoke === undefined)
      throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501);
    if (service?.exists !== undefined && !(await service.exists(request.targetId)))
      throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_NOT_FOUND", 404);
    const value = await invoke({
      generationId: generation.generationId,
      graphHash: generation.graphHash,
      functionId: request.targetId,
      input: request.body.input,
      idempotencyKey: request.idempotencyKey,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    } satisfies InspectorFunctionActionRequest);
    return { output: safeJson(value, ACTION_REDACTION) };
  }
  if (request.action.startsWith("job.")) {
    const service = actions.jobs;
    assertProtocol(service, "relkit.jobs.admin");
    const method = request.action === "job.retry" ? service?.retry : service?.cancel;
    if (method === undefined)
      throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501);
    if (service?.status !== undefined)
      assertActionState(request.action, await service.status(request.targetId));
    const actionReason = reason(request.body.reason);
    return projectAdmin(
      await method({
        protocol: "relkit.jobs.admin",
        version: PROTOCOL_VERSION,
        instanceId: request.targetId,
        ...(actionReason === undefined ? {} : { reason: actionReason }),
      } satisfies InspectorJobActionRequest),
    );
  }
  if (request.action.startsWith("event.")) {
    const service = actions.events;
    assertProtocol(service, "relkit.events.admin");
    const method = request.action === "event.retry" ? service?.retry : service?.cancel;
    if (method === undefined)
      throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501);
    if (service?.status !== undefined)
      assertActionState(request.action, await service.status(request.targetId));
    const actionReason = reason(request.body.reason);
    return projectAdmin(
      await method({
        protocol: "relkit.events.admin",
        version: PROTOCOL_VERSION,
        deliveryId: request.targetId,
        ...(actionReason === undefined ? {} : { reason: actionReason }),
      } satisfies InspectorEventActionRequest),
    );
  }
  return approveTool(request, actions);
}

async function approveTool(
  request: InspectorActionRequest,
  actions: InspectorActionServices,
): Promise<Record<string, unknown>> {
  const service = actions.approvals ?? actions.tools?.approvals;
  if (service === undefined)
    throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501);
  const approvalRequest = {
    invocationId: bounded(request.body.invocationId),
    toolCallId: bounded(request.body.toolCallId),
    toolId: request.targetId,
    idempotencyKey: request.idempotencyKey,
  } satisfies InspectorToolApprovalRequest;
  const current = await service.get({
    invocationId: approvalRequest.invocationId,
    toolCallId: approvalRequest.toolCallId,
    toolId: approvalRequest.toolId,
  });
  if (!current || current.state !== "pending")
    throw new InspectorActionError("RELKIT_INSPECTOR_APPROVAL_STATE_INELIGIBLE", 409);
  const method = request.action === "tool.deny" ? service.deny : service.approve;
  if (method === undefined)
    throw new InspectorActionError("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501);
  return { approval: projectApproval(await method(approvalRequest)) };
}

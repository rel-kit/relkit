import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise } from "./native-edge.js";
import { inspectorExecution } from "./execution.js";
import { nativeAttempt, projectionAttempt } from "./native-edge.js";
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

/**
 * Dispatches a validated action through the existing native administration contracts.
 * @param request - Parsed action identity, target and input fields validated before dispatch.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param actions - Native active-generation administration authorities.
 * @returns A lazy observed Effect containing a redacted public result preserving native action failure behavior.
 */
export const dispatchInspectorActionEffect = Effect.fn("Inspector.dispatchInspectorAction")(
  function* (
    request: InspectorActionRequest,
    generation: ResolvedActiveGeneration,
    actions: InspectorActionServices,
  ) {
    if (request.action === "function.invoke") {
      const service = actions.functions;
      const invoke = service?.invoke ?? actions.invokeFunction;
      if (invoke === undefined)
        return yield* Effect.fail(
          new InspectorActionError("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501),
        );
      const exists = service?.exists;
      if (
        exists !== undefined &&
        !(yield* nativeAttempt(() => exists.call(service, request.targetId)))
      )
        return yield* Effect.fail(
          new InspectorActionError("RELKIT_INSPECTOR_ACTION_NOT_FOUND", 404),
        );
      const value = yield* nativeAttempt(() =>
        invoke({
          generationId: generation.generationId,
          graphHash: generation.graphHash,
          functionId: request.targetId,
          input: request.body.input,
          idempotencyKey: request.idempotencyKey,
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        } satisfies InspectorFunctionActionRequest),
      );
      return { output: safeJson(value, ACTION_REDACTION) };
    }
    if (request.action.startsWith("job.")) {
      const service = actions.jobs;
      yield* projectionAttempt(() => assertProtocol(service, "relkit.jobs.admin"));
      const method = request.action === "job.retry" ? service?.retry : service?.cancel;
      if (method === undefined)
        return yield* Effect.fail(
          new InspectorActionError("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501),
        );
      const status = service?.status;
      if (status !== undefined) {
        const current = yield* nativeAttempt(() => status.call(service, request.targetId));
        yield* projectionAttempt(() => assertActionState(request.action, current));
      }
      const actionReason = yield* projectionAttempt(() => reason(request.body.reason));
      return projectAdmin(
        yield* nativeAttempt(() =>
          method({
            protocol: "relkit.jobs.admin",
            version: PROTOCOL_VERSION,
            instanceId: request.targetId,
            ...(actionReason === undefined ? {} : { reason: actionReason }),
          } satisfies InspectorJobActionRequest),
        ),
      );
    }
    if (request.action.startsWith("event.")) {
      const service = actions.events;
      yield* projectionAttempt(() => assertProtocol(service, "relkit.events.admin"));
      const method = request.action === "event.retry" ? service?.retry : service?.cancel;
      if (method === undefined)
        return yield* Effect.fail(
          new InspectorActionError("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501),
        );
      const status = service?.status;
      if (status !== undefined) {
        const current = yield* nativeAttempt(() => status.call(service, request.targetId));
        yield* projectionAttempt(() => assertActionState(request.action, current));
      }
      const actionReason = yield* projectionAttempt(() => reason(request.body.reason));
      return projectAdmin(
        yield* nativeAttempt(() =>
          method({
            protocol: "relkit.events.admin",
            version: PROTOCOL_VERSION,
            deliveryId: request.targetId,
            ...(actionReason === undefined ? {} : { reason: actionReason }),
          } satisfies InspectorEventActionRequest),
        ),
      );
    }
    return yield* approveToolEffect(request, actions);
  },
  (effect) => observeExecution("inspector", "dispatchInspectorAction", effect),
);

/**
 * Dispatches a validated action through the existing native administration contracts.
 * @param request - Parsed action identity, target and input fields validated before dispatch.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param actions - Native active-generation administration authorities.
 * @returns A redacted public result preserving native action failure behavior.
 */
export function dispatchInspectorAction(
  request: InspectorActionRequest,
  generation: ResolvedActiveGeneration,
  actions: InspectorActionServices,
): Promise<Record<string, unknown>> {
  return runExecutionPromise(
    inspectorExecution,
    dispatchInspectorActionEffect(request, generation, actions),
  );
}

/**
 * Resolves approval state before invoking the selected native tool decision.
 * @param request - Parsed action identity, target and input fields validated before dispatch.
 * @param actions - Native active-generation administration authorities.
 * @returns A lazy observed Effect containing a public approval receipt with private handlers and inputs removed.
 */
const approveToolEffect = Effect.fn("Inspector.approveTool")(
  function* (request: InspectorActionRequest, actions: InspectorActionServices) {
    const service = actions.approvals ?? actions.tools?.approvals;
    if (service === undefined)
      return yield* Effect.fail(
        new InspectorActionError("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501),
      );
    const approvalRequest = yield* projectionAttempt(
      () =>
        ({
          invocationId: bounded(request.body.invocationId),
          toolCallId: bounded(request.body.toolCallId),
          toolId: request.targetId,
          idempotencyKey: request.idempotencyKey,
        }) satisfies InspectorToolApprovalRequest,
    );
    const current = yield* nativeAttempt(() =>
      service.get({
        invocationId: approvalRequest.invocationId,
        toolCallId: approvalRequest.toolCallId,
        toolId: approvalRequest.toolId,
      }),
    );
    if (!current || current.state !== "pending")
      return yield* Effect.fail(
        new InspectorActionError("RELKIT_INSPECTOR_APPROVAL_STATE_INELIGIBLE", 409),
      );
    const method = request.action === "tool.deny" ? service.deny : service.approve;
    if (method === undefined)
      return yield* Effect.fail(
        new InspectorActionError("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501),
      );
    return { approval: projectApproval(yield* nativeAttempt(() => method(approvalRequest))) };
  },
  (effect) => observeExecution("inspector", "approveTool", effect),
);

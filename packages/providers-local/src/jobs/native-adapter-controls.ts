import type { RunCancellationReceipt, RunRetryReceipt } from "@relkit/contracts/jobs";
import type {
  NativeCancelRequest,
  NativeControlReceipt,
  NativeRetryRequest,
  NativeSubmission,
  OperationContext,
} from "@relkit/jobs/adapter";
import { controlKey, sameNamespace, terminal } from "./native-adapter-support.js";
import { createRun, handle, newRunId } from "./native-adapter-runs.js";
import type { LocalNativeState } from "./native-adapter-types.js";

export async function cancelRun(
  state: LocalNativeState,
  request: NativeCancelRequest,
  context: OperationContext,
): Promise<NativeControlReceipt> {
  const key = controlKey("cancel", request.runId, request.operationId, context);
  const previous = state.cancelControls.get(key);
  if (previous !== undefined) return previous as NativeControlReceipt;
  const run = state.runs.get(request.runId);
  if (run === undefined) throw new Error("Native run was not found");
  if (!sameNamespace(run, context)) throw new Error("Native run is outside the operation scope");
  const receipt: RunCancellationReceipt = terminal(run.status)
    ? { runId: run.runId, operationId: request.operationId, outcome: "already-terminal" }
    : {
        runId: run.runId,
        operationId: request.operationId,
        outcome: "requested",
        requestedAt: new Date().toISOString(),
      };
  if (receipt.outcome === "requested") {
    run.status = "cancelled";
    run.completedAt = new Date().toISOString();
    run.controller?.abort(request.reason);
  }
  state.cancelControls.set(key, receipt);
  return receipt;
}

export async function retryRun(
  state: LocalNativeState,
  request: NativeRetryRequest,
  context: OperationContext,
): Promise<NativeControlReceipt> {
  const key = controlKey("retry", request.runId, request.operationId, context);
  const previous = state.retryControls.get(key);
  if (previous !== undefined) return previous as NativeControlReceipt;
  const original = state.runs.get(request.runId);
  if (original === undefined) throw new Error("Native run was not found");
  if (!sameNamespace(original, context))
    throw new Error("Native run is outside the operation scope");
  if (request.scope !== undefined && request.scope !== context.scope) {
    throw new Error("Native retry scope does not match the operation scope");
  }
  if (!terminal(original.status)) throw new Error("Native retry requires a terminal run");
  const identity = request.retryIdentity ?? request.operationId;
  const retryRequest: NativeSubmission = {
    ...original.request,
    operationId: request.operationId,
    idempotencyKey: `${original.request.idempotencyKey ?? original.runId}:retry:${identity}`,
    canonicalInput: request.canonicalInput ?? original.canonicalInput,
    ...(request.inputHash === undefined ? {} : { inputHash: request.inputHash }),
    ...(request.inputSchemaHash === undefined ? {} : { inputSchemaHash: request.inputSchemaHash }),
    ...(request.acceptanceIdentity === undefined
      ? {
          acceptanceIdentity: `${original.request.acceptanceIdentity ?? original.runId}:retry:${identity}`,
        }
      : { acceptanceIdentity: request.acceptanceIdentity }),
    retryOfRunId: original.runId,
  };
  const retry = createRun(retryRequest, context, newRunId(context.service), original.runId);
  state.runs.set(retry.runId, retry);
  const receipt: RunRetryReceipt = { ...handle(retry), retryOfRunId: original.runId };
  state.retryControls.set(key, receipt);
  return receipt;
}

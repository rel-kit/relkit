import type {
  JobUnknownOutcome,
  RunCancellationReceipt,
  RunRetryReceipt,
} from "@relkit/contracts/jobs";
import type {
  NativeCancelRequest,
  NativeControlReceipt,
  NativeRetryRequest,
} from "@relkit/jobs/adapter";
import type { TestClock } from "./runtime.js";
import { isTerminal, snapshotOf, type TestNativeRun } from "./test-jobs-adapter-support.js";
import { handle } from "./test-jobs-adapter-work.js";

/**
 * Applies the first native cancellation transition and acknowledgement receipt.
 * @param runs - Authoritative native runs indexed by accepted identity.
 * @param receipts - Owner-local first-wins native control receipt registry.
 * @param request - Native operation input carrying explicit identity and execution context.
 * @param unknownOutcome - Whether the native write acknowledges an ambiguous outcome.
 * @param service - Native service identity included in public run snapshots.
 * @param clock - Injected deterministic domain clock.
 * @returns The existing native cancellation or ambiguous-write result.
 */
export async function cancel(
  runs: Map<string, TestNativeRun>,
  receipts: Map<string, NativeControlReceipt>,
  request: NativeCancelRequest,
  unknownOutcome: boolean,
  service: string,
  clock: TestClock,
): Promise<NativeControlReceipt> {
  if (unknownOutcome) return unknown("RELKIT_JOB_CONTROL_UNKNOWN", request.operationId);
  const key = `${request.runId}\0${request.operationId}`;
  const previous = receipts.get(key);
  if (previous !== undefined) return previous;
  const run = runs.get(request.runId);
  if (run === undefined) throw new Error("Test run was not found");
  const receipt: RunCancellationReceipt = isTerminal(run.status)
    ? {
        runId: run.runId,
        operationId: request.operationId,
        outcome: "already-terminal",
        run: snapshotOf(run, service, clock),
      }
    : {
        runId: run.runId,
        operationId: request.operationId,
        outcome: "requested",
        requestedAt: clock.now().toISOString(),
      };
  if (receipt.outcome === "requested") {
    run.status = "cancelled";
    run.completedAt = clock.now().toISOString();
    run.controller?.abort(request.reason);
    run.disposeSignal?.();
  }
  receipts.set(key, receipt);
  return receipt;
}

/**
 * Creates a deduplicated native retry with a fresh canonical run identity.
 * @param runs - Authoritative native runs indexed by accepted identity.
 * @param receipts - Owner-local first-wins native control receipt registry.
 * @param request - Native operation input carrying explicit identity and execution context.
 * @param unknownOutcome - Whether the native write acknowledges an ambiguous outcome.
 * @param service - Native service identity included in public run snapshots.
 * @param clock - Injected deterministic domain clock.
 * @returns The retry receipt or existing ambiguous-write outcome.
 */
export async function retry(
  runs: Map<string, TestNativeRun>,
  receipts: Map<string, NativeControlReceipt>,
  request: NativeRetryRequest,
  unknownOutcome: boolean,
  service: string,
  clock: TestClock,
): Promise<NativeControlReceipt> {
  if (unknownOutcome) return unknown("RELKIT_JOB_CONTROL_UNKNOWN", request.operationId);
  const key = `${request.runId}\0${request.operationId}`;
  const previous = receipts.get(key);
  if (previous !== undefined) return previous;
  const original = runs.get(request.runId);
  if (original === undefined || !isTerminal(original.status))
    throw new Error("Test retry requires a terminal run");
  const {
    completedAt: _completedAt,
    output: _output,
    error: _error,
    controller: _controller,
    disposeSignal: _disposeSignal,
    startedAt: _startedAt,
    ...prior
  } = original;
  const run: TestNativeRun = {
    ...prior,
    runId: `test-run-${runs.size + 1}`,
    status: "queued",
    attempt: 1,
    acceptedAt: clock.now().toISOString(),
    canonicalInput: request.canonicalInput ?? original.canonicalInput,
    retryOfRunId: original.runId,
    request: {
      ...original.request,
      operationId: request.operationId,
      retryOfRunId: original.runId,
      canonicalInput: request.canonicalInput ?? original.canonicalInput,
      idempotencyKey: `${original.runId}:retry:${request.retryIdentity ?? request.operationId}`,
    },
  };
  runs.set(run.runId, run);
  const receipt: RunRetryReceipt = { ...handle(run), retryOfRunId: original.runId };
  receipts.set(key, receipt);
  return receipt;
}

/**
 * Builds an explicit ambiguous native write result.
 * @param code - Native code supplied to this workflow.
 * @param operationId - Explicit native write operation identity.
 * @param idempotencyKey - Native idempotencyKey supplied to this workflow.
 * @returns The existing unknown-outcome envelope retaining operation identity.
 */
export function unknown(
  code: JobUnknownOutcome["code"],
  operationId: string,
  idempotencyKey?: string,
): JobUnknownOutcome {
  return {
    code,
    outcome: "unknown",
    operationId,
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    recovery: { action: "inspect-native" },
  };
}

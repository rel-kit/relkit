import type {
  JobUnknownOutcome,
  RunCancellationReceipt,
  RunRetryReceipt,
  RunSnapshot,
} from "@relkit/contracts/jobs";
import { assertJobsCapability, JobsCapabilityError } from "./capabilities.js";
import type { OperationContext } from "./adapter.js";
import type { JobsRuntime } from "./runtime.js";
import type { UnknownControlOutcome } from "./control-support.types.js";
export { isTerminal, observerTimeout } from "./control-support-value-observation.js";
/** Builds a native context with a caller signal and optional operation ID.
 * @param runtime - Jobs runtime.
 * @param signal - Optional caller signal.
 * @param operationId - Optional idempotent identity.
 * @returns Native operation context.
 * @example operationContext(runtime, undefined, "cancel-1");
 */
export function operationContext(
  runtime: JobsRuntime,
  signal: AbortSignal | undefined,
  operationId?: string,
): OperationContext {
  return runtime.operationContext({
    signal: signal ?? new AbortController().signal,
    ...(operationId === undefined ? {} : { operationId }),
  });
}
/** Requires a provider method and its reported capability.
 * @param runtime - Jobs runtime.
 * @param capability - Capability name.
 * @param method - Native adapter method.
 * @returns Nothing when supported.
 * @throws JobsCapabilityError when unavailable.
 * @example requireMethod(runtime, "read", "get");
 */
export function requireMethod(
  runtime: JobsRuntime,
  capability: string,
  method: keyof JobsRuntime["adapter"],
): void {
  if (typeof runtime.adapter[method] !== "function") throw new JobsCapabilityError(capability);
  if (runtime.capabilities.features[capability] === false)
    throw new JobsCapabilityError(capability);
  if (
    runtime.capabilities.capabilities?.[capability] !== undefined ||
    runtime.capabilities.features[capability] === true
  ) {
    assertJobsCapability(runtime.capabilities, capability);
  }
}
/** Validates a bounded idempotent control operation identity.
 * @param value - Candidate operation ID.
 * @returns Nothing when valid.
 * @throws TypeError for blank or oversized IDs.
 * @example requireOperationId("cancel-1");
 */
export function requireOperationId(value: string): void {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    new TextEncoder().encode(value).byteLength > 256
  ) {
    throw new TypeError("operationId must be a bounded non-empty string");
  }
}
/** Validates and freezes a native cancellation receipt.
 * @param value - Provider response.
 * @param runId - Requested run identity.
 * @param operationId - Requested operation identity.
 * @returns Immutable cancellation receipt.
 * @throws TypeError for mismatched identities or invalid fields.
 * @example normalizeCancellationReceipt(receipt, "run-1", "cancel-1");
 */
export function normalizeCancellationReceipt(
  value: unknown,
  runId: string,
  operationId: string,
): RunCancellationReceipt {
  if (
    !isRecord(value) ||
    value.runId !== runId ||
    value.operationId !== operationId ||
    !isCancellationOutcome(value.outcome)
  ) {
    throw new TypeError("Native cancel receipt is invalid");
  }
  if (value.requestedAt !== undefined && typeof value.requestedAt !== "string") {
    throw new TypeError("Native cancel receipt timestamp is invalid");
  }
  if (value.run !== undefined && !isRecord(value.run))
    throw new TypeError("Native cancel receipt run is invalid");
  return Object.freeze({
    runId,
    operationId,
    outcome: value.outcome,
    ...(value.requestedAt === undefined ? {} : { requestedAt: value.requestedAt }),
    ...(value.run === undefined ? {} : { run: value.run as unknown as RunSnapshot }),
  });
}
/** Validates that a native retry created a new run from the original.
 * @param value - Provider response.
 * @param originalRunId - Source run identity.
 * @returns Immutable retry receipt.
 * @throws TypeError for missing durable identity or reused run ID.
 * @example normalizeRetryReceipt(receipt, "run-1");
 */
export function normalizeRetryReceipt(value: unknown, originalRunId: string): RunRetryReceipt {
  if (!isRecord(value) || value.accepted !== true || value.retryOfRunId !== originalRunId) {
    throw new TypeError("Native retry receipt is invalid");
  }
  const fields = ["runId", "jobId", "taskId", "taskVersion", "acceptedAt"] as const;
  if (fields.some((field) => typeof value[field] !== "string" || value[field] === "")) {
    throw new TypeError("Native retry receipt is missing durable identity");
  }
  if (value.runId === originalRunId)
    throw new TypeError("Native retry receipt did not create a new run");
  return Object.freeze({
    accepted: true,
    runId: value.runId as string,
    jobId: value.jobId as string,
    taskId: value.taskId as string,
    taskVersion: value.taskVersion as string,
    acceptedAt: value.acceptedAt as string,
    retryOfRunId: originalRunId,
    ...(value.duplicate === true ? { duplicate: true } : {}),
    ...(typeof value.idempotencyExpiresAt === "string"
      ? { idempotencyExpiresAt: value.idempotencyExpiresAt }
      : {}),
  });
}
/** Recognizes an uncertain native control outcome.
 * @param value - Provider response.
 * @returns True when the outcome and operation ID allow recovery.
 * @example isUnknown(response);
 */
export function isUnknown(value: unknown): value is UnknownControlOutcome {
  return isRecord(value) && value.outcome === "unknown" && typeof value.operationId === "string";
}
function isCancellationOutcome(value: unknown): value is RunCancellationReceipt["outcome"] {
  return value === "requested" || value === "already-terminal" || value === "unsupported";
}
/** Reads an optional idempotency key from an uncertain outcome.
 * @param value - Provider response.
 * @returns Recovery key when supplied.
 * @example unknownKey(response);
 */
export function unknownKey(value: unknown): string | undefined {
  return isRecord(value) && typeof value.idempotencyKey === "string"
    ? value.idempotencyKey
    : undefined;
}
/** Copies a recognized native recovery action from an uncertain outcome.
 * @param value - Provider response.
 * @returns Bounded recovery instructions when valid.
 * @example unknownRecovery(response);
 */
export function unknownRecovery(value: unknown): JobUnknownOutcome["recovery"] | undefined {
  const recovery = isRecord(value) && isRecord(value.recovery) ? value.recovery : undefined;
  if (recovery === undefined || typeof recovery.action !== "string") return undefined;
  if (
    recovery.action !== "retry-with-same-key" &&
    recovery.action !== "inspect-native" &&
    recovery.action !== "unavailable"
  ) {
    return undefined;
  }
  return {
    action: recovery.action,
    ...(typeof recovery.expiresAt === "string" ? { expiresAt: recovery.expiresAt } : {}),
  };
}
/** Tests for a nonarray native response record.
 * @param value - Provider response candidate.
 * @returns True for nonarray objects.
 * @example isRecord({ outcome: "requested" });
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

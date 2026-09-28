import type { JsonValue } from "@relkit/contracts";
import type { JobUnknownOutcome, RunHandle } from "@relkit/contracts/jobs";
import type { NativeReceipt } from "./adapter.js";
import { durationToMillis } from "./duration.js";
import {
  JobReceiptError,
  JobSubmissionError,
  JobSubmissionUnknownError,
} from "./submission-errors.js";
import type { TaskSubmissionMetadata, SubmissionAdmission } from "./submission.js";
import type { JobsRuntime, JobsRuntimeBinding } from "./runtime.js";
import type { UnknownSubmissionOutcome } from "./submission-support.types.js";
import { type CopiedTriggerOptions } from "./trigger-validation.js";
import { stableIdentityTuple } from "./identity.js";
export {
  currentCorrelation,
  propagationFor,
  currentTaskRunId,
} from "./submission-support-value-context.js";
/** Normalizes provider rejection and uncertain acceptance into public errors.
 * @param cause - Native error or unknown outcome.
 * @param metadata - Stable operation and idempotency identities.
 * @returns Original error or a structured submission error.
 * @example normalizeSubmissionError(cause, metadata);
 */
export function normalizeSubmissionError(cause: unknown, metadata: TaskSubmissionMetadata): Error {
  if (cause instanceof JobSubmissionUnknownError) return cause;
  if (isUnknown(cause)) {
    return new JobSubmissionUnknownError(
      cause.operationId || metadata.operationId,
      cause.idempotencyKey ?? metadata.idempotencyKey,
      cause.recovery,
    );
  }
  return cause instanceof Error ? cause : new JobSubmissionError(String(cause), cause);
}
/** Validates that native acceptance matches the pinned task and job binding.
 * @param value - Provider receipt.
 * @param binding - Expected resolved binding.
 * @param metadata - Submitted identity for unknown recovery.
 * @returns Frozen accepted run handle.
 * @throws JobReceiptError or JobSubmissionUnknownError for invalid outcomes.
 * @example normalizeReceipt(receipt, binding, metadata);
 */
export function normalizeReceipt(
  value: NativeReceipt | unknown,
  binding: JobsRuntimeBinding,
  metadata: TaskSubmissionMetadata,
): RunHandle {
  if (isUnknown(value)) {
    throw new JobSubmissionUnknownError(
      value.operationId || metadata.operationId,
      value.idempotencyKey ?? metadata.idempotencyKey,
      value.recovery,
    );
  }
  if (!isRecord(value) || value.accepted !== true) {
    throw new JobReceiptError("Native submission did not return an accepted receipt");
  }
  const required = ["runId", "jobId", "taskId", "taskVersion", "acceptedAt"] as const;
  if (required.some((key) => typeof value[key] !== "string" || String(value[key]).length === 0)) {
    throw new JobReceiptError("Native submission receipt is missing durable identity");
  }
  if (
    value.jobId !== binding.jobId ||
    value.taskId !== binding.taskId ||
    value.taskVersion !== binding.taskVersion
  ) {
    throw new JobReceiptError("Native submission receipt does not match the resolved binding");
  }
  return Object.freeze({
    accepted: true,
    runId: value.runId as string,
    jobId: value.jobId as string,
    taskId: value.taskId as string,
    taskVersion: value.taskVersion as string,
    acceptedAt: value.acceptedAt as string,
    ...(value.duplicate === true ? { duplicate: true } : {}),
    ...(typeof value.idempotencyExpiresAt === "string"
      ? { idempotencyExpiresAt: value.idempotencyExpiresAt }
      : {}),
  });
}
/** Resolves explicit or input-derived idempotency and checks agreement.
 * @param job - Optional job admission policy.
 * @param options - Validated trigger options.
 * @param input - Canonical input value.
 * @returns Bounded key when present.
 * @throws TypeError for mismatched or nonscalar keys.
 * @example explicitOrDerivedKey(job, options, { orderId: "one" });
 */
export function explicitOrDerivedKey(
  job: { readonly admission?: { readonly idempotency?: { readonly key?: string } } } | undefined,
  options: CopiedTriggerOptions,
  input: JsonValue | undefined,
): string | undefined {
  const field = job?.admission?.idempotency?.key;
  const derived =
    field === undefined || input === undefined || !isRecord(input)
      ? undefined
      : deriveKey(field, input);
  if (options.idempotencyKey !== undefined) {
    const explicit = boundedKey(options.idempotencyKey);
    if (derived !== undefined && explicit !== derived) {
      throw new TypeError(`Idempotency key must match the declared field "${field}"`);
    }
    return explicit;
  }
  return derived;
}
function deriveKey(field: string, input: Record<string, unknown>): string {
  const value = input[field];
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    (typeof value === "number" && !Number.isFinite(value))
  ) {
    throw new TypeError(`Idempotency field "${field}" must be a canonical scalar`);
  }
  return boundedKey(stableIdentityTuple([field, value]));
}
/** Checks the 256-byte idempotency key limit.
 * @param value - Candidate key.
 * @returns The key when bounded.
 * @throws TypeError for oversized keys.
 * @example boundedKey("order-1");
 */
export function boundedKey(value: string): string {
  if (new TextEncoder().encode(value).byteLength > 256)
    throw new TypeError("Idempotency key is too long");
  return value;
}
/** Resolves a trigger's absolute time or delay against a supplied clock.
 * @param options - Validated trigger options.
 * @param now - Current epoch milliseconds.
 * @returns RFC3339 time when scheduled.
 * @throws TypeError for an invalid duration.
 * @example scheduledTime({ delay: "1 second" }, 0);
 */
export function scheduledTime(options: CopiedTriggerOptions, now: number): string | undefined {
  if (options.at !== undefined) return options.at;
  if (options.delay === undefined) return undefined;
  return new Date(now + durationToMillis(options.delay)).toISOString();
}
/** Rebuilds a canonical wire envelope from admitted input.
 * @param admission - Prepared submission.
 * @returns Void or JSON wire envelope.
 * @example validatedEnvelope(admission);
 */
export function validatedEnvelope(admission: SubmissionAdmission) {
  return admission.canonicalInput === undefined
    ? { version: 1 as const, kind: "void" as const }
    : { version: 1 as const, kind: "json" as const, value: admission.canonicalInput };
}
/** Recognizes a native unknown submission response with recovery data.
 * @param value - Provider response.
 * @returns True for a structured uncertain outcome.
 * @example isUnknown(response);
 */
export function isUnknown(value: unknown): value is UnknownSubmissionOutcome {
  return (
    isRecord(value) &&
    value.outcome === "unknown" &&
    (value.code === "RELKIT_JOB_SUBMISSION_UNKNOWN" ||
      value.code === "RELKIT_JOB_CONTROL_UNKNOWN") &&
    typeof value.operationId === "string" &&
    isRecord(value.recovery) &&
    typeof value.recovery.action === "string"
  );
}
/** Tests for a nonarray provider record.
 * @param value - Provider response candidate.
 * @returns True for nonarray objects.
 * @example isRecord({ accepted: true });
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

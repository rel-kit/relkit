import type { RunHandle } from "@relkit/contracts/jobs";
import type { NativeReceipt } from "./adapter.js";
import type { JobsRuntimeBinding } from "./runtime.js";
import type { SubmissionAdmission, TaskSubmissionMetadata } from "./submission.types.js";
import type { UnknownSubmissionOutcome } from "./submission-support.types.js";
import { Effect } from "effect";
import {
  normalizeSubmissionError as errorValue,
  normalizeReceipt as receiptValue,
  validatedEnvelope as envelopeValue,
  isUnknown as unknownValue,
  isRecord as recordValue,
} from "./submission-support-value.js";
import { runSubmissionSupport, submissionSupportEffect } from "./submission-support-run.js";
/** Normalizes an uncertain provider error in Effect.
 * @param cause - Provider failure or uncertain outcome.
 * @param metadata - Submission recovery identity.
 * @returns Compatibility error or SubmissionSupportFailure.
 * @example Effect.runSync(normalizeSubmissionErrorEffect(cause, metadata));
 */
export const normalizeSubmissionErrorEffect = Effect.fn("Jobs.normalizeSubmissionError")(
  (cause: unknown, metadata: TaskSubmissionMetadata) =>
    submissionSupportEffect("submissionSupport.error", () => errorValue(cause, metadata)),
);
/** Synchronous provider error normalizer.
 * @param cause - Provider failure or uncertain outcome.
 * @param metadata - Submission recovery identity.
 * @returns Compatibility error.
 * @throws Original constructor defect when normalization fails.
 * @example normalizeSubmissionError(cause, metadata);
 */
export function normalizeSubmissionError(cause: unknown, metadata: TaskSubmissionMetadata): Error {
  return runSubmissionSupport(normalizeSubmissionErrorEffect(cause, metadata));
}
/** Validates a native accepted receipt in Effect.
 * @param value - Native receipt.
 * @param binding - Expected task and job binding.
 * @param metadata - Submitted operation identity.
 * @returns Frozen run handle or SubmissionSupportFailure.
 * @example Effect.runSync(normalizeReceiptEffect(receipt, binding, metadata));
 */
export const normalizeReceiptEffect = Effect.fn("Jobs.normalizeSubmissionReceipt")(
  (value: NativeReceipt | unknown, binding: JobsRuntimeBinding, metadata: TaskSubmissionMetadata) =>
    submissionSupportEffect("submissionSupport.receipt", () =>
      receiptValue(value, binding, metadata),
    ),
);
/** Synchronous accepted receipt normalizer.
 * @param value - Native receipt.
 * @param binding - Expected task and job binding.
 * @param metadata - Submitted operation identity.
 * @returns Frozen run handle.
 * @throws JobReceiptError or JobSubmissionUnknownError for invalid outcomes.
 * @example normalizeReceipt(receipt, binding, metadata);
 */
export function normalizeReceipt(
  value: NativeReceipt | unknown,
  binding: JobsRuntimeBinding,
  metadata: TaskSubmissionMetadata,
): RunHandle {
  return runSubmissionSupport(normalizeReceiptEffect(value, binding, metadata));
}
/** Rebuilds a validated canonical envelope in Effect.
 * @param admission - Prepared submission.
 * @returns Canonical envelope; no expected failure.
 * @example Effect.runSync(validatedEnvelopeEffect(admission));
 */
export const validatedEnvelopeEffect = Effect.fn("Jobs.validatedSubmissionEnvelope")(
  (admission: SubmissionAdmission) =>
    submissionSupportEffect("submissionSupport.envelope", () => envelopeValue(admission)),
);
/** Synchronous canonical envelope rebuilder.
 * @param admission - Prepared submission.
 * @returns Canonical envelope.
 * @example validatedEnvelope(admission);
 */
export function validatedEnvelope(admission: SubmissionAdmission) {
  return runSubmissionSupport(validatedEnvelopeEffect(admission));
}
/** Tests an uncertain native submission outcome in Effect.
 * @param value - Native response candidate.
 * @returns True for a recognized uncertain outcome; no expected failure.
 * @example Effect.runSync(isUnknownSubmissionEffect(response));
 */
export const isUnknownSubmissionEffect = Effect.fn("Jobs.isUnknownSubmission")((value: unknown) =>
  submissionSupportEffect("submissionSupport.isUnknown", () => unknownValue(value)),
);
/** Synchronous uncertain submission type guard.
 * @param value - Native response candidate.
 * @returns True for a recognized uncertain outcome.
 * @example if (isUnknown(response)) console.log(response.operationId);
 */
export function isUnknown(value: unknown): value is UnknownSubmissionOutcome {
  return runSubmissionSupport(isUnknownSubmissionEffect(value));
}
/** Tests for a nonarray submission record in Effect.
 * @param value - Candidate value.
 * @returns True for a nonarray record; no expected failure.
 * @example Effect.runSync(isSubmissionRecordEffect({ accepted: true }));
 */
export const isSubmissionRecordEffect = Effect.fn("Jobs.isSubmissionRecord")((value: unknown) =>
  submissionSupportEffect("submissionSupport.isRecord", () => recordValue(value)),
);
/** Synchronous nonarray record guard.
 * @param value - Candidate value.
 * @returns True for a nonarray record.
 * @example isRecord({ accepted: true });
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return runSubmissionSupport(isSubmissionRecordEffect(value));
}

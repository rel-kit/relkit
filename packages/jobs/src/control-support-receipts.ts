import type {
  JobUnknownOutcome,
  RunCancellationReceipt,
  RunRetryReceipt,
} from "@relkit/contracts/jobs";
import { Effect } from "effect";
import {
  normalizeCancellationReceipt as cancellationValue,
  normalizeRetryReceipt as retryValue,
  isUnknown as unknownValue,
  unknownKey as keyValue,
  unknownRecovery as recoveryValue,
} from "./control-support-value.js";
import { controlSupportEffect, runControlSupport } from "./control-support-run.js";
import type { UnknownControlOutcome } from "./control-support.types.js";
/** Normalizes a native cancellation receipt in Effect.
 * @param value - Native receipt.
 * @param runId - Expected run identity.
 * @param operationId - Expected operation identity.
 * @returns Frozen receipt or ControlSupportFailure.
 * @example Effect.runSync(normalizeCancellationReceiptEffect(value, "run", "cancel"));
 */
export const normalizeCancellationReceiptEffect = Effect.fn("Jobs.normalizeCancellationReceipt")(
  (value: unknown, runId: string, operationId: string) =>
    controlSupportEffect("controlSupport.cancelReceipt", () =>
      cancellationValue(value, runId, operationId),
    ),
);
/** Synchronous cancellation receipt normalizer.
 * @param value - Native receipt.
 * @param runId - Expected run identity.
 * @param operationId - Expected operation identity.
 * @returns Frozen receipt.
 * @throws TypeError for a mismatched or malformed receipt.
 * @example normalizeCancellationReceipt(value, "run", "cancel");
 */
export function normalizeCancellationReceipt(
  value: unknown,
  runId: string,
  operationId: string,
): RunCancellationReceipt {
  return runControlSupport(normalizeCancellationReceiptEffect(value, runId, operationId));
}
/** Normalizes a native retry receipt in Effect.
 * @param value - Native receipt.
 * @param originalRunId - Run being retried.
 * @returns Frozen retry receipt or ControlSupportFailure.
 * @example Effect.runSync(normalizeRetryReceiptEffect(value, "run-1"));
 */
export const normalizeRetryReceiptEffect = Effect.fn("Jobs.normalizeRetryReceipt")(
  (value: unknown, originalRunId: string) =>
    controlSupportEffect("controlSupport.retryReceipt", () => retryValue(value, originalRunId)),
);
/** Synchronous retry receipt normalizer.
 * @param value - Native receipt.
 * @param originalRunId - Run being retried.
 * @returns Frozen retry receipt.
 * @throws TypeError for a mismatched or malformed receipt.
 * @example normalizeRetryReceipt(value, "run-1");
 */
export function normalizeRetryReceipt(value: unknown, originalRunId: string): RunRetryReceipt {
  return runControlSupport(normalizeRetryReceiptEffect(value, originalRunId));
}
/** Tests an uncertain native outcome in Effect.
 * @param value - Native response candidate.
 * @returns True for an uncertain outcome; no expected failure.
 * @example Effect.runSync(isUnknownEffect(response));
 */
export const isUnknownEffect = Effect.fn("Jobs.isUnknownControlOutcome")((value: unknown) =>
  controlSupportEffect("controlSupport.isUnknown", () => unknownValue(value)),
);
/** Synchronous uncertain outcome type guard.
 * @param value - Native response candidate.
 * @returns True for an uncertain outcome.
 * @example if (isUnknown(response)) console.log(response.operationId);
 */
export function isUnknown(value: unknown): value is UnknownControlOutcome {
  return runControlSupport(isUnknownEffect(value));
}
/** Reads an uncertain outcome's idempotency key in Effect.
 * @param value - Native response candidate.
 * @returns Key when present; no expected failure.
 * @example Effect.runSync(unknownKeyEffect(response));
 */
export const unknownKeyEffect = Effect.fn("Jobs.unknownControlKey")((value: unknown) =>
  controlSupportEffect("controlSupport.unknownKey", () => keyValue(value)),
);
/** Synchronous uncertain outcome key reader.
 * @param value - Native response candidate.
 * @returns Key when present.
 * @example unknownKey(response);
 */
export function unknownKey(value: unknown): string | undefined {
  return runControlSupport(unknownKeyEffect(value));
}
/** Reads bounded recovery guidance in Effect.
 * @param value - Native response candidate.
 * @returns Recovery guidance when valid; no expected failure.
 * @example Effect.runSync(unknownRecoveryEffect(response));
 */
export const unknownRecoveryEffect = Effect.fn("Jobs.unknownControlRecovery")((value: unknown) =>
  controlSupportEffect("controlSupport.unknownRecovery", () => recoveryValue(value)),
);
/** Synchronous uncertain outcome recovery reader.
 * @param value - Native response candidate.
 * @returns Recovery guidance when valid.
 * @example unknownRecovery(response);
 */
export function unknownRecovery(value: unknown): JobUnknownOutcome["recovery"] | undefined {
  return runControlSupport(unknownRecoveryEffect(value));
}

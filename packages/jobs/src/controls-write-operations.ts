import type { RunCancellationReceipt, RunRetryReceipt } from "@relkit/contracts/jobs";
import { Effect, Result, Schema } from "effect";
import type { NativeCancelRequest, NativeRetryRequest } from "./adapter.js";
import { JobControlUnknownError } from "./control-errors.js";
import { requireMethodEffect, requireOperationIdEffect } from "./control-support-methods.js";
import {
  isUnknownEffect,
  normalizeCancellationReceiptEffect,
  normalizeRetryReceiptEffect,
  unknownKeyEffect,
  unknownRecoveryEffect,
} from "./control-support-receipts.js";
import { controlWriteEffect } from "./control-write.js";
import { getRunOperationEffect } from "./controls-read.js";
import type { JobCancelOptions, JobRetryOptions } from "./controls.types.js";
import { retryOperationIdentityEffect } from "./identity.js";
import type { JobsRuntime } from "./runtime.js";
/** Expected native control operation failure with its compatibility cause.
 * @example new ControlOperationFailure({ cause: new Error("provider rejected") });
 */
export class ControlOperationFailure extends Schema.TaggedError<ControlOperationFailure>()(
  "Jobs.ControlOperationFailure",
  { cause: Schema.Defect() },
) {}
/** Validates and submits an idempotent native cancellation in Effect.
 * @param runtime - Jobs runtime and native adapter.
 * @param runId - Run to cancel.
 * @param options - Operation identity, signal, and reason.
 * @returns A cancellation receipt or ControlOperationFailure.
 * @example Effect.runPromise(cancelRunOperationEffect(runtime, "run", { operationId: "op" }));
 */
export const cancelRunOperationEffect = Effect.fn("Jobs.cancelRunOperation")(function* (
  runtime: JobsRuntime,
  runId: string,
  options: JobCancelOptions,
) {
  const failure = (error: { cause: unknown }) =>
    new ControlOperationFailure({ cause: error.cause });
  yield* Effect.mapError(requireOperationIdEffect(options.operationId), failure);
  yield* Effect.mapError(requireMethodEffect(runtime, "cancel", "cancel"), failure);
  const request: NativeCancelRequest = {
    runId,
    operationId: options.operationId,
    ...(options.reason === undefined ? {} : { reason: options.reason }),
  };
  const value: unknown = yield* Effect.mapError(
    controlWriteEffect(
      () =>
        runtime.adapter.cancel(
          request,
          runtime.operationContext({
            signal: options.signal ?? new AbortController().signal,
            operationId: options.operationId,
          }),
        ),
      options.signal,
      options.operationId,
    ),
    failure,
  );
  if (yield* Effect.mapError(isUnknownEffect(value), failure)) {
    const key = yield* Effect.mapError(unknownKeyEffect(value), failure);
    const recovery = yield* Effect.mapError(unknownRecoveryEffect(value), failure);
    return yield* new ControlOperationFailure({
      cause: new JobControlUnknownError(options.operationId, key, recovery),
    });
  }
  return yield* Effect.mapError(
    normalizeCancellationReceiptEffect(value, runId, options.operationId),
    failure,
  );
});
/** Promise compatibility cancellation for internal control consumers.
 * @param runtime - Jobs runtime and native adapter.
 * @param runId - Run to cancel.
 * @param options - Operation identity, signal, and reason.
 * @returns A cancellation receipt.
 * @throws The original capability, cancellation, provider, or receipt error.
 * @example await cancelRunValue(runtime, "run", { operationId: "op" });
 */
export async function cancelRunValue(
  runtime: JobsRuntime,
  runId: string,
  options: JobCancelOptions,
): Promise<RunCancellationReceipt> {
  const result = await Effect.runPromise(
    Effect.result(cancelRunOperationEffect(runtime, runId, options)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Reuses pinned run identity to request a fresh native retry in Effect.
 * @param runtime - Jobs runtime and native adapter.
 * @param runId - Original run identifier.
 * @param options - Idempotent retry options.
 * @returns A retry receipt or ControlOperationFailure.
 * @example Effect.runPromise(retryRunOperationEffect(runtime, "run", { operationId: "op" }));
 */
export const retryRunOperationEffect = Effect.fn("Jobs.retryRunOperation")(function* (
  runtime: JobsRuntime,
  runId: string,
  options: JobRetryOptions,
) {
  const failure = (error: { cause: unknown }) =>
    new ControlOperationFailure({ cause: error.cause });
  yield* Effect.mapError(requireOperationIdEffect(options.operationId), failure);
  yield* Effect.mapError(requireMethodEffect(runtime, "retry", "retry"), failure);
  const retry = runtime.adapter.retry;
  if (typeof retry !== "function")
    return yield* new ControlOperationFailure({
      cause: new TypeError("Native retry operation is unavailable"),
    });
  const original = yield* Effect.mapError(
    getRunOperationEffect(runtime, runId, options.signal),
    failure,
  );
  const retryIdentity = yield* Effect.mapError(
    retryOperationIdentityEffect(runId, options.operationId),
    failure,
  );
  const request: NativeRetryRequest = {
    runId,
    operationId: options.operationId,
    retryIdentity,
    ...(original.taskId === undefined ? {} : { taskId: original.taskId }),
    ...(original.jobId === undefined ? {} : { jobId: original.jobId }),
    ...(original.taskVersion === undefined ? {} : { taskVersion: original.taskVersion }),
    ...(original.buildId === undefined ? {} : { buildId: original.buildId }),
    ...(original.scope === undefined ? {} : { scope: original.scope }),
    ...(original.inputHash === undefined ? {} : { inputHash: original.inputHash }),
    ...(original.inputSchemaHash === undefined
      ? {}
      : { inputSchemaHash: original.inputSchemaHash }),
    ...(original.acceptanceIdentity === undefined
      ? {}
      : { acceptanceIdentity: original.acceptanceIdentity }),
    canonicalAdmission: {
      validatePinnedInput: true,
      allocateFreshBudget: true,
      clearInitialDelay: true,
    },
  };
  const value: unknown = yield* Effect.mapError(
    controlWriteEffect(
      () =>
        retry(
          request,
          runtime.operationContext({
            signal: options.signal ?? new AbortController().signal,
            operationId: options.operationId,
          }),
        ),
      options.signal,
      options.operationId,
    ),
    failure,
  );
  if (yield* Effect.mapError(isUnknownEffect(value), failure)) {
    const key = yield* Effect.mapError(unknownKeyEffect(value), failure);
    const recovery = yield* Effect.mapError(unknownRecoveryEffect(value), failure);
    return yield* new ControlOperationFailure({
      cause: new JobControlUnknownError(options.operationId, key, recovery),
    });
  }
  return yield* Effect.mapError(normalizeRetryReceiptEffect(value, runId), failure);
});
/** Promise compatibility retry for internal control consumers.
 * @param runtime - Jobs runtime and native adapter.
 * @param runId - Original run identifier.
 * @param options - Idempotent retry options.
 * @returns A retry receipt.
 * @throws The original capability, provider, cancellation, or receipt error.
 * @example await retryRunValue(runtime, "run", { operationId: "op" });
 */
export async function retryRunValue(
  runtime: JobsRuntime,
  runId: string,
  options: JobRetryOptions,
): Promise<RunRetryReceipt> {
  const result = await Effect.runPromise(
    Effect.result(retryRunOperationEffect(runtime, runId, options)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}

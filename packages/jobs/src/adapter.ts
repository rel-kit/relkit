import { JOBS_PROTOCOL_VERSION } from "@relkit/contracts/jobs";
import { Effect, Result, Schema } from "effect";
import {
  assertAdapterMethodsEffect,
  JobsCapabilityError,
  validateJobsCapabilityReportEffect,
} from "./capabilities.js";
import { observeJobs } from "./jobs-observability.js";
import type { JobsAdapterRuntime } from "./adapter.types.js";
export type {
  NativeCancelRequest,
  NativeControlReceipt,
  NativeReceipt,
  NativeRetryRequest,
  NativeSubmission,
  NativeWatchRequest,
  OperationContext,
} from "./adapter-requests.types.js";
export type {
  NativeRun,
  NativeRunQuery,
  NativeRunPage,
  NativeObservation,
  NativeLocator,
  NativeScheduleOperations,
  NativeProgressWriter,
  NativeStreamWriter,
  NativeStreamWriters,
  NativeDurableSleep,
  TaskExecutionEnvelope,
  TaskExecutor,
  JobsAdapterRuntime,
  NativeTaskWork,
  NativeTaskWorker,
  TaskExecutionBinding,
} from "./adapter.types.js";
export type { JobsCapabilityReport } from "./capabilities.js";
export {
  JobsCapabilityError,
  assertAdapterMethods,
  assertJobsCapability,
  validateJobsCapabilityReport,
} from "./capabilities.js";
/** Protocol version required by all jobs adapters.
 * @example adapter.protocolVersion === JOBS_ADAPTER_PROTOCOL_VERSION;
 */
export const JOBS_ADAPTER_PROTOCOL_VERSION = JOBS_PROTOCOL_VERSION;
/** Invalid jobs adapter shape or protocol.
 * @example if (error instanceof JobsAdapterValidationError) console.log(error.message);
 */
export class JobsAdapterValidationError extends Schema.TaggedError<JobsAdapterValidationError>()(
  "Jobs.AdapterValidationError",
  { reason: Schema.String },
) {}
/** Validates an untrusted jobs adapter in Effect.
 * @param value - Candidate adapter.
 * @returns The validated adapter or a tagged adapter/capability failure.
 * @example Effect.runSync(assertJobsAdapterRuntimeEffect(adapter));
 */
export const assertJobsAdapterRuntimeEffect = Effect.fn("Jobs.assertAdapterRuntime")(
  function* (value: unknown) {
    if (value === null || typeof value !== "object")
      return yield* new JobsAdapterValidationError({
        reason: "Jobs adapter runtime must be an object",
      });
    const adapter = value as JobsAdapterRuntime;
    if (adapter.kind !== "jobs-adapter-runtime")
      return yield* new JobsAdapterValidationError({
        reason: "Jobs adapter runtime has an invalid kind",
      });
    if (adapter.protocolVersion !== JOBS_ADAPTER_PROTOCOL_VERSION)
      return yield* new JobsAdapterValidationError({
        reason: `Unsupported jobs adapter protocol ${String(adapter.protocolVersion)}`,
      });
    yield* validateJobsCapabilityReportEffect(adapter.capabilities);
    yield* assertAdapterMethodsEffect(adapter);
    return adapter;
  },
  (effect) => observeJobs("adapter.assertRuntime", effect),
);
/** Synchronous adapter shape assertion.
 * @param value - Candidate adapter.
 * @returns Void when valid.
 * @throws TypeError or JobsCapabilityError when invalid.
 * @example assertJobsAdapterRuntime(adapter);
 */
export function assertJobsAdapterRuntime(value: unknown): asserts value is JobsAdapterRuntime {
  const result = Effect.runSync(Effect.result(assertJobsAdapterRuntimeEffect(value)));
  if (Result.isSuccess(result)) return;
  const failure = result.failure;
  if (failure instanceof JobsAdapterValidationError) throw new TypeError(failure.reason);
  throw new JobsCapabilityError(failure.capability, failure.reason);
}
/** Checks the jobs adapter brand in Effect.
 * @param value - Candidate adapter.
 * @returns True for the jobs adapter brand; no expected failure.
 * @example Effect.runSync(isJobsAdapterRuntimeEffect(value));
 */
export const isJobsAdapterRuntimeEffect = Effect.fn("Jobs.isAdapterRuntime")((value: unknown) =>
  observeJobs(
    "adapter.isRuntime",
    Effect.sync(
      () =>
        value !== null &&
        typeof value === "object" &&
        (value as { readonly kind?: unknown }).kind === "jobs-adapter-runtime",
    ),
  ),
);
/** Synchronous jobs adapter brand check.
 * @param value - Candidate adapter.
 * @returns True when it carries the adapter brand.
 * @example isJobsAdapterRuntime(value);
 */
export function isJobsAdapterRuntime(value: unknown): value is JobsAdapterRuntime {
  return Effect.runSync(isJobsAdapterRuntimeEffect(value));
}

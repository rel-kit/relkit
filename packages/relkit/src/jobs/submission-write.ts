import { Effect, Result, Schema } from "effect";
import type { JobsAdapterRuntime, OperationContext } from "./adapter.js";
import { observeJobs } from "./jobs-observability.js";
import { JobSubmissionCancelledError, JobSubmissionUnknownError } from "./submission-errors.js";
import { normalizeSubmissionError } from "./submission-support.js";
import type { TaskSubmissionMetadata } from "./submission.types.js";
import type { SubmissionWriteRegistration } from "./submission-write.types.js";
/** Cancelled, uncertain, or provider failed native submission.
 * @example if (error instanceof JobSubmissionWriteFailure) console.log(error.message);
 */
export class JobSubmissionWriteFailure extends Schema.TaggedError<JobSubmissionWriteFailure>()(
  "Jobs.SubmissionWriteFailure",
  { operationId: Schema.String, kind: Schema.String, cause: Schema.Defect() },
) {}
/** Submits with an Effect owned abort listener and uncertain outcome semantics.
 * @param adapter - Native jobs provider.
 * @param request - Canonical native submission.
 * @param context - Operation context passed to the provider.
 * @param signal - Caller cancellation signal.
 * @param metadata - Recovery identifiers for an uncertain outcome.
 * @returns The provider receipt or JobSubmissionWriteFailure.
 * @example Effect.runPromise(submitAbortableEffect(adapter, request, context, signal, metadata));
 */
export const submitAbortableEffect = Effect.fn("Jobs.submitAbortable")(
  function* (
    adapter: JobsAdapterRuntime,
    request: Parameters<JobsAdapterRuntime["submit"]>[0],
    context: OperationContext,
    signal: AbortSignal,
    metadata: TaskSubmissionMetadata,
  ) {
    if (signal.aborted)
      return yield* Effect.fail(failure(metadata, "cancelled", new JobSubmissionCancelledError()));
    return yield* Effect.acquireUseRelease(
      registerAbort(signal, metadata),
      (registration) => {
        if (registration.isAborted())
          return Effect.fail(failure(metadata, "cancelled", new JobSubmissionCancelledError()));
        return Effect.tryPromise({
          try: (effectSignal) => {
            const providerSignal = AbortSignal.any([signal, effectSignal]);
            let started = false;
            const pending = Promise.resolve().then(() => {
              if (providerSignal.aborted) throw new JobSubmissionCancelledError();
              started = true;
              return adapter.submit(request, Object.freeze({ ...context, signal: providerSignal }));
            });
            const aborted = registration.aborted.then(() => {
              throw started
                ? new JobSubmissionUnknownError(metadata.operationId, metadata.idempotencyKey)
                : new JobSubmissionCancelledError();
            });
            return Promise.race([pending, aborted]);
          },
          catch: (cause) => {
            const normalized = normalizeSubmissionError(cause, metadata);
            return failure(
              metadata,
              normalized instanceof JobSubmissionUnknownError
                ? "unknown"
                : normalized instanceof JobSubmissionCancelledError
                  ? "cancelled"
                  : "provider",
              normalized,
            );
          },
        });
      },
      (registration) => Effect.sync(registration.dispose),
    );
  },
  (effect) => observeJobs("submission.write", effect),
);
/** Promise compatibility adapter for native submission.
 * @param adapter - Native jobs provider.
 * @param request - Canonical native submission.
 * @param context - Operation context passed to the provider.
 * @param signal - Caller cancellation signal.
 * @param metadata - Recovery identifiers.
 * @returns The native receipt.
 * @throws The original cancellation, unknown outcome, or provider error.
 * @example await submitAbortable(adapter, request, context, signal, metadata);
 */
export async function submitAbortable(
  adapter: JobsAdapterRuntime,
  request: Parameters<JobsAdapterRuntime["submit"]>[0],
  context: OperationContext,
  signal: AbortSignal,
  metadata: TaskSubmissionMetadata,
): Promise<unknown> {
  const result = await Effect.runPromise(
    Effect.result(submitAbortableEffect(adapter, request, context, signal, metadata)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Acquires a listener, including a signal aborted during registration. */
function registerAbort(
  signal: AbortSignal,
  metadata: TaskSubmissionMetadata,
): Effect.Effect<SubmissionWriteRegistration, JobSubmissionWriteFailure> {
  return Effect.try({
    try: () => {
      let cancelled = false;
      let resolveAbort: () => void = () => undefined;
      const aborted = new Promise<void>((resolve) => {
        resolveAbort = resolve;
      });
      const onAbort = (): void => {
        cancelled = true;
        resolveAbort();
      };
      try {
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      } catch (cause) {
        try {
          signal.removeEventListener("abort", onAbort);
        } catch {
          /* Keep primary failure. */
        }
        throw cause;
      }
      return {
        aborted,
        isAborted: () => cancelled,
        dispose: () => signal.removeEventListener("abort", onAbort),
      };
    },
    catch: (cause) => failure(metadata, "register", cause),
  });
}
function failure(
  metadata: TaskSubmissionMetadata,
  kind: string,
  cause: unknown,
): JobSubmissionWriteFailure {
  return new JobSubmissionWriteFailure({ operationId: metadata.operationId, kind, cause });
}

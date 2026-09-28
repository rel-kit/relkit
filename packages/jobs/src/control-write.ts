import { Effect, Result, Schema } from "effect";
import { JobControlUnknownError } from "./control-errors.js";
import { observeJobs } from "./jobs-observability.js";
import type { ControlWriteRegistration } from "./control-write.types.js";

/** A cancelled, uncertain, or provider-failed native control write.
 * @example new JobControlWriteFailure({ operationId: "op", kind: "unknown", cause: new Error() });
 */
export class JobControlWriteFailure extends Schema.TaggedError<JobControlWriteFailure>()(
  "Jobs.ControlWriteFailure",
  { operationId: Schema.String, kind: Schema.String, cause: Schema.Defect() },
) {}

/** Calls a native control write with an Effect-managed abort listener.
 * Cancellation before the provider begins prevents the call. Cancellation
 * after start produces an unknown outcome requiring operation-id recovery.
 * @param call - Native provider operation.
 * @param signal - Optional cancellation signal.
 * @param operationId - Stable idempotency key for recovery.
 * @returns Provider result or JobControlWriteFailure.
 * @example Effect.runPromise(controlWriteEffect(() => Promise.resolve("ok"), undefined, "op"));
 */
export const controlWriteEffect = Effect.fn("Jobs.controlWrite")(
  function* <A>(call: () => Promise<A>, signal: AbortSignal | undefined, operationId: string) {
    if (signal === undefined) return yield* providerCall(call, operationId);
    if (signal.aborted)
      return yield* Effect.fail(failure(operationId, "cancelled", cancellationReason(signal)));
    return yield* Effect.acquireUseRelease(
      registerAbort(signal, operationId),
      (registration) => {
        if (registration.isAborted())
          return Effect.fail(failure(operationId, "cancelled", cancellationReason(signal)));
        return Effect.tryPromise({
          try: () => {
            let started = false;
            const pending = Promise.resolve().then(() => {
              if (registration.isAborted()) throw cancellationReason(signal);
              started = true;
              return call();
            });
            const aborted = registration.aborted.then(() => {
              throw started ? new JobControlUnknownError(operationId) : cancellationReason(signal);
            });
            return Promise.race([pending, aborted]);
          },
          catch: (cause) =>
            failure(
              operationId,
              cause instanceof JobControlUnknownError
                ? "unknown"
                : signal.aborted
                  ? "cancelled"
                  : "provider",
              cause,
            ),
        });
      },
      (registration) => Effect.sync(registration.dispose),
    );
  },
  (effect) => observeJobs("control.write", effect),
);

/** Promise compatibility adapter for native control writes.
 * @param call - Native provider operation.
 * @param signal - Optional cancellation signal.
 * @param operationId - Stable idempotency key for recovery.
 * @returns The provider's Promise result.
 * @throws The original cancellation, unknown-outcome, or provider error.
 * @example await controlWrite(() => Promise.resolve("ok"), undefined, "op");
 */
export async function controlWrite<A>(
  call: () => Promise<A>,
  signal: AbortSignal | undefined,
  operationId: string,
): Promise<A> {
  const result = await Effect.runPromise(
    Effect.result(controlWriteEffect(call, signal, operationId)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}

/** Acquires an abort listener, including synchronous registration callbacks. */
function registerAbort(
  signal: AbortSignal,
  operationId: string,
): Effect.Effect<ControlWriteRegistration, JobControlWriteFailure> {
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
          // Keep the registration failure as the primary cause.
        }
        throw cause;
      }
      return {
        aborted,
        isAborted: () => cancelled,
        dispose: () => signal.removeEventListener("abort", onAbort),
      };
    },
    catch: (cause) => failure(operationId, "register", cause),
  });
}

/** Converts provider rejection into the stable control-write error channel. */
function providerCall<A>(
  call: () => Promise<A>,
  operationId: string,
): Effect.Effect<A, JobControlWriteFailure> {
  return Effect.tryPromise({
    try: () => Promise.resolve().then(call),
    catch: (cause) => failure(operationId, "provider", cause),
  });
}

/** Uses the signal reason when available, preserving the compatibility error. */
function cancellationReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Job control was cancelled before acceptance");
}

/** Creates a typed failure without changing the original cause. */
function failure(operationId: string, kind: string, cause: unknown): JobControlWriteFailure {
  return new JobControlWriteFailure({ operationId, kind, cause });
}

import { Cause, Effect, Option, Ref } from "effect";
import { ServerRuntimeFailure } from "./server-runtime.schemas.js";
import type { RuntimeSnapshot } from "./server-runtime.types.js";
import type { RuntimeEnvironmentOperations } from "./server-runtime.types.js";

/**
 * Records native primary failures separately from cleanup evidence.
 * @param environment - Explicit structured log sink.
 * @param state - Generation state owned by the runtime service.
 * @param failure - Original failure and bounded operation identity.
 * @param cleanup - Whether failure arose while releasing owned resources.
 * @returns A lazy evidence publication that cannot replace the primary result.
 */
export const recordFailure = Effect.fn("ServerRuntime.failure")(function* (
  environment: RuntimeEnvironmentOperations,
  state: Ref.Ref<RuntimeSnapshot>,
  failure: ServerRuntimeFailure,
  cleanup: boolean,
) {
  yield* Ref.update(state, (value) => ({
    ...value,
    ...(cleanup
      ? { cleanupFailures: boundedEvidence(value.cleanupFailures, failure) }
      : { primaryFailures: boundedEvidence(value.primaryFailures, failure) }),
  }));
  yield* environment.report(failure, cleanup).pipe(Effect.catchCause(() => Effect.void));
});

/**
 * Bounds one finalization stage and retains failures instead of squashing them.
 * @param environment - Release deadlines and existing failure log adapter.
 * @param state - Mutable generation evidence.
 * @param operation - Fixed cleanup-stage identity.
 * @param task - Lazy cleanup work.
 * @param milliseconds - This stage's configured deadline.
 * @returns A non-failing release effect; evidence remains available in the snapshot.
 */
export const boundedCleanup = Effect.fn("ServerRuntime.cleanup")(function* (
  environment: RuntimeEnvironmentOperations,
  state: Ref.Ref<RuntimeSnapshot>,
  operation: string,
  task: Effect.Effect<unknown, ServerRuntimeFailure>,
  milliseconds: number,
) {
  const completed = yield* task.pipe(
    Effect.interruptible,
    Effect.asVoid,
    Effect.catchCause((cause) =>
      recordFailure(
        environment,
        state,
        new ServerRuntimeFailure({ operation, cause: Cause.squash(cause) }),
        true,
      ),
    ),
    Effect.timeoutOption(milliseconds),
  );

  if (Option.isNone(completed)) {
    yield* Ref.update(state, (value) => ({ ...value, timedOut: [...value.timedOut, operation] }));
    yield* recordFailure(
      environment,
      state,
      new ServerRuntimeFailure({
        operation,
        cause: new Error("Runtime cleanup deadline expired."),
      }),
      true,
    );
  }
});

/**
 * Retains the first failure and at most 31 recent failures independently of log retention.
 * @param current - Previously retained evidence.
 * @param failure - New evidence.
 * @returns A bounded immutable history preserving the original primary failure.
 */
function boundedEvidence(current: readonly ServerRuntimeFailure[], failure: ServerRuntimeFailure) {
  return current.length < 32
    ? [...current, failure]
    : [...current.slice(0, 1), ...current.slice(-30), failure];
}

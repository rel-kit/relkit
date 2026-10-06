import { Cause, Duration, Effect, Exit, Fiber, Ref, Schedule, Scope } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { recordFailure } from "./runtime-cleanup.js";
import { ServerRuntimeFailure } from "./server-runtime.schemas.js";
import type { RuntimeSnapshot } from "./server-runtime.types.js";
import type { RuntimeEnvironmentOperations } from "./server-runtime.types.js";

/**
 * Runs serial polling passes in the generation worker scope.
 * @param environment - Configured polling cadence and failure sink.
 * @param state - Published generation state.
 * @param scope - Scope whose closure interrupts polling and registration retries.
 * @param operation - Fixed worker identity used in telemetry.
 * @param pass - One interruptible pass; expected failures are reported and retried next pass.
 * @returns After the scoped loop is registered; it never detaches a timer or Promise.
 */
export const forkRuntimeWorker = Effect.fn("ServerRuntime.worker")(
  function* (
    environment: RuntimeEnvironmentOperations,
    state: Ref.Ref<RuntimeSnapshot>,
    scope: Scope.Closeable,
    operation: string,
    pass: Effect.Effect<void, ServerRuntimeFailure>,
  ) {
    if ((yield* Ref.get(state)).stopping)
      return yield* Effect.fail(
        new ServerRuntimeFailure({ operation, cause: new Error("Runtime is stopping.") }),
      );
    const guarded = Effect.suspend(() => (Ref.getUnsafe(state).stopping ? Effect.void : pass)).pipe(
      Effect.catch((failure) => recordFailure(environment, state, failure, false)),
    );
    yield* guarded.pipe(
      Effect.repeat(Schedule.fixed(environment.workerIntervalMs)),
      Effect.delay(environment.workerIntervalMs),
      Effect.onExit((exit) =>
        Exit.isFailure(exit) && Cause.hasDies(exit.cause)
          ? recordFailure(
              environment,
              state,
              new ServerRuntimeFailure({ operation, cause: Cause.squash(exit.cause) }),
              false,
            )
          : Effect.void,
      ),
      Effect.forkIn(scope),
    );
  },
  (effect) => observeExecution("runtime", "server.worker", effect),
);

/**
 * Supervises idempotent worker readiness with the existing capped backoff.
 * @param environment - Failure adapter.
 * @param state - Published lifecycle state.
 * @param scope - Generation retry owner.
 * @param operation - Fixed registration identity.
 * @param action - Ready/register action whose repeated execution is idempotent.
 * @returns Once ready or after owning-scope interruption; defects are not retried.
 */
export const retryRuntimeRegistration = Effect.fn("ServerRuntime.retry")(
  function* (
    environment: RuntimeEnvironmentOperations,
    state: Ref.Ref<RuntimeSnapshot>,
    scope: Scope.Closeable,
    operation: string,
    action: Effect.Effect<void, ServerRuntimeFailure>,
  ) {
    if ((yield* Ref.get(state)).stopping)
      return yield* Effect.fail(
        new ServerRuntimeFailure({ operation, cause: new Error("Runtime is stopping.") }),
      );
    const schedule = Schedule.exponential(250).pipe(
      Schedule.modifyDelay(({ duration }) =>
        Effect.succeed(Duration.min(duration, Duration.millis(5_000))),
      ),
    );
    const fiber = yield* action.pipe(Effect.retry(schedule), Effect.forkIn(scope));
    yield* Fiber.join(fiber);
  },
  (effect) => observeExecution("runtime", "server.retry", effect),
);

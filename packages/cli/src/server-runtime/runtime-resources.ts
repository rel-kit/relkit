import { Cause, Effect, Exit, Ref, Scope } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { boundedCleanup, recordFailure } from "./runtime-cleanup.js";
import { ServerRuntimeFailure } from "./server-runtime.schemas.js";
import type { RuntimeSnapshot } from "./server-runtime.types.js";
import type { RuntimeEnvironmentOperations } from "./server-runtime.types.js";

/**
 * Acquires and initializes a resource in a generation-owned child scope.
 * @typeParam A - Acquired integration handle.
 * @param environment - Explicit generation environment.
 * @param state - Evidence state.
 * @param owner - Scope owning every acquired generation resource.
 * @param operation - Bounded startup identity.
 * @param acquire - Scoped acquisition that registers release before validation.
 * @param initialize - Materialization performed after acquisition.
 * @returns The initialized handle, preserving its primary failure on cleanup errors.
 */
export const acquireRuntimeResource = Effect.fn("ServerRuntime.resource")(
  function* <A>(
    environment: RuntimeEnvironmentOperations,
    state: Ref.Ref<RuntimeSnapshot>,
    owner: Scope.Closeable,
    operation: string,
    acquire: Effect.Effect<A, ServerRuntimeFailure, Scope.Scope>,
    initialize: (value: A) => Effect.Effect<void, ServerRuntimeFailure>,
  ) {
    if ((yield* Ref.get(state)).stopping)
      return yield* Effect.fail(
        new ServerRuntimeFailure({ operation, cause: new Error("Runtime is stopping.") }),
      );
    const scope = yield* Scope.fork(owner, "sequential");
    const acquired = yield* Effect.exit(
      Effect.gen(function* () {
        const value = yield* acquire;
        yield* initialize(value);
        return value;
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    );
    if (Exit.isFailure(acquired)) {
      if (!Cause.hasInterruptsOnly(acquired.cause))
        yield* boundedCleanup(
          environment,
          state,
          operation + ".rollback",
          Scope.close(scope, acquired),
          environment.drainTimeoutMs,
        );
      // Interrupted startup leaves the child with its generation owner until physical drain.
      // Operational startup failure rolls back immediately and retains its primary cause.
      if (!Cause.hasInterruptsOnly(acquired.cause)) {
        const cause = Cause.squash(acquired.cause);
        yield* recordFailure(
          environment,
          state,
          cause instanceof ServerRuntimeFailure
            ? cause
            : new ServerRuntimeFailure({ operation, cause }),
          false,
        );
      }
      return yield* Effect.failCause(acquired.cause);
    }
    return acquired.value;
  },
  (effect) => observeExecution("runtime", "server.resource", effect),
);

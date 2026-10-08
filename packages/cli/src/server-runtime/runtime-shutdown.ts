import { Deferred, Effect, Exit, Ref, Scope } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { boundedCleanup } from "./runtime-cleanup.js";
import type { RuntimeGenerationOwner } from "./server-runtime.types.js";
import type { ServerRuntimeFailure } from "./server-runtime.schemas.js";

/**
 * Elects one shutdown leader and always publishes completion to subsequent callers.
 * @param owner - Generation-owned state, physical receipts, child scopes and deadlines.
 * @param beforeRelease - Span and persistence cleanup while application resources remain open.
 * @param beforeTelemetry - Final flush after application producers have stopped.
 * @returns Final bounded evidence, retaining primary failures independently of cleanup.
 * @remarks Masking covers only this finite finalization protocol. Each native release
 * restores interruptibility and has its own deadline; caller interruption cannot strand
 * the completion Deferred after leader election.
 */
export const closeRuntimeGeneration = Effect.fn("ServerRuntime.shutdown")(
  function* (
    owner: RuntimeGenerationOwner,
    beforeRelease: Effect.Effect<void, ServerRuntimeFailure>,
    beforeTelemetry: Effect.Effect<void, ServerRuntimeFailure> = Effect.void,
  ) {
    const {
      environment,
      state,
      active,
      workers,
      resources,
      workerResources,
      telemetryResources,
      completion,
    } = owner;
    const alreadyStopping = yield* Ref.modify(state, (current) => [
      current.stopping,
      { ...current, stopping: true },
    ]);
    if (alreadyStopping) return yield* Deferred.await(completion);
    yield* Effect.sync(() => environment.controller.abort(new Error("Runtime is stopping.")));
    yield* boundedCleanup(
      environment,
      state,
      "workers.stop",
      Scope.close(workers, Exit.void),
      environment.drainTimeoutMs,
    );
    yield* boundedCleanup(
      environment,
      state,
      "invocations.drain",
      Effect.forEach(
        yield* Ref.get(active),
        (task) =>
          Effect.promise(() =>
            task.then(
              () => undefined,
              () => undefined,
            ),
          ),
        { concurrency: 16, discard: true },
      ),
      environment.drainTimeoutMs,
    );
    yield* boundedCleanup(
      environment,
      state,
      "workers.release",
      Scope.close(workerResources, Exit.void),
      environment.drainTimeoutMs,
    );
    yield* boundedCleanup(
      environment,
      state,
      "runtime.before-release",
      beforeRelease,
      environment.drainTimeoutMs,
    );
    yield* boundedCleanup(
      environment,
      state,
      "resources.release",
      Scope.close(resources, Exit.void),
      environment.drainTimeoutMs,
    );
    yield* boundedCleanup(
      environment,
      state,
      "runtime.before-telemetry",
      beforeTelemetry,
      environment.telemetryTimeoutMs,
    );
    yield* boundedCleanup(
      environment,
      state,
      "telemetry.resources.release",
      Scope.close(telemetryResources, Exit.void),
      environment.telemetryTimeoutMs,
    );
    yield* Ref.set(active, new Set());
    const result = yield* Ref.get(state);
    yield* Deferred.succeed(completion, result);
    return result;
  },
  (effect) => observeExecution("runtime", "server.shutdown", effect.pipe(Effect.uninterruptible)),
);

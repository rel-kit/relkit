import { Context, Deferred, Effect, Exit, Fiber, Layer, Ref, Scope } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { RuntimeEnvironment } from "./runtime-environment.js";
import { boundedCleanup, recordFailure } from "./runtime-cleanup.js";
import { closeRuntimeGeneration } from "./runtime-shutdown.js";
import { acquireRuntimeResource } from "./runtime-resources.js";
import { forkRuntimeWorker, retryRuntimeRegistration } from "./runtime-workers.js";
import { ServerRuntimeFailure } from "./server-runtime.schemas.js";
import type { RuntimeArea, RuntimeSnapshot } from "./server-runtime.types.js";
import type { ServerRuntimeOperations } from "./server-runtime.types.js";

/**
 * Generation lifecycle authority. One layer scope owns every resource and worker.
 * @example
 * ```ts
 * import { createServerRuntimeHost } from "@relkit/cli/internal/server-runtime";
 * const host = await createServerRuntimeHost({ report: () => {} });
 * try { await host.resource("provider", async () => ({ closed: false }), (value) => { value.closed = true; }); }
 * finally { await host.shutdown(async () => {}); }
 * ```
 * @see createServerRuntimeHost for the generated framework adapter.
 */
export class ServerRuntime extends Context.Service<ServerRuntime, ServerRuntimeOperations>()(
  "@relkit/cli/ServerRuntime",
) {}

/**
 * Builds lifecycle state before exposing operations or registering background work.
 * @remarks Requires RuntimeEnvironment explicitly. Its layer scope is the generation
 * owner; child resource scopes survive successful initialization and roll back on failure.
 */
export const ServerRuntimeLive = Layer.effect(
  ServerRuntime,
  Effect.gen(function* () {
    const environment = yield* RuntimeEnvironment;
    const owner = yield* Scope.Scope;
    const resources = yield* Scope.fork(owner, "sequential");
    const telemetryResources = yield* Scope.fork(owner, "sequential");
    const workerResources = yield* Scope.fork(owner, "sequential");
    const workers = yield* Scope.fork(owner, "parallel");
    const state = yield* Ref.make<RuntimeSnapshot>({
      stopping: false,
      ready: environment.initialReady,
      primaryFailures: [],
      cleanupFailures: [],
      timedOut: [],
      pendingInvocations: 0,
    });
    const active = yield* Ref.make<ReadonlySet<Promise<unknown>>>(new Set());
    const completion = yield* Deferred.make<RuntimeSnapshot>();
    const readiness = {
      provider: yield* Deferred.make<void>(),
      database: yield* Deferred.make<void>(),
      auth: yield* Deferred.make<void>(),
      nativeWorker: yield* Deferred.make<void>(),
      server: yield* Deferred.make<void>(),
    };
    yield* Effect.forEach(
      ["provider", "database", "auth", "nativeWorker", "server"] as const,
      (area) =>
        environment.initialReady[area] ? Deferred.succeed(readiness[area], undefined) : Effect.void,
      { discard: true },
    );

    /** Read-only effect; the framework adapter uses runSync after layer acquisition. */
    const snapshot = Effect.fn("ServerRuntime.snapshot")(
      () =>
        Ref.get(state).pipe(
          Effect.map((value) => ({ ...value, pendingInvocations: Ref.getUnsafe(active).size })),
        ),
      (effect) => observeExecution("runtime", "server.snapshot", effect),
    );

    /**
     * Publishes readiness without reviving a generation that already began shutdown.
     * @param area - Readiness dimension.
     * @param ready - Current readiness result.
     * @returns A lazy atomic state publication.
     */
    const setReady = Effect.fn("ServerRuntime.setReady")(
      function* (area: RuntimeArea, ready: boolean) {
        const value = yield* Ref.updateAndGet(state, (current) =>
          current.stopping ? current : { ...current, ready: { ...current.ready, [area]: ready } },
        );
        if (value.ready[area]) yield* Deferred.succeed(readiness[area], undefined);
      },
      (effect) => observeExecution("runtime", "server.readiness", effect),
    );

    /**
     * Tracks physical SDK completion even if the waiting Effect is interrupted.
     * @typeParam A - Promise result retained at the framework boundary.
     * @param task - Already-started external work owned by this generation.
     * @returns An interruptible wait; shutdown still drains interrupted native work.
     */
    const track = Effect.fn("ServerRuntime.track")(
      function* <A>(task: Promise<A>) {
        yield* Effect.gen(function* () {
          yield* Ref.update(active, (current) => new Set([...current, task]));
          // This separately owned receipt follows physical completion, not the cancelled waiter.
          yield* Effect.promise(() =>
            task.then(
              () => undefined,
              () => undefined,
            ),
          ).pipe(
            Effect.ensuring(
              Ref.update(
                active,
                (current) => new Set([...current].filter((entry) => entry !== task)),
              ),
            ),
            Effect.forkIn(owner),
          );
        }).pipe(Effect.uninterruptible);
        return yield* Effect.tryPromise({
          try: () => task,
          catch: (cause) => new ServerRuntimeFailure({ operation: "invocation", cause }),
        });
      },
      (effect) => observeExecution("runtime", "server.invocation", effect),
    );

    const shutdown = (
      beforeRelease: Effect.Effect<void, ServerRuntimeFailure>,
      beforeTelemetry?: Effect.Effect<void, ServerRuntimeFailure>,
    ) =>
      closeRuntimeGeneration(
        {
          environment,
          state,
          active,
          workers,
          resources,
          workerResources,
          telemetryResources,
          completion,
        },
        beforeRelease,
        beforeTelemetry,
      );

    return ServerRuntime.of({
      snapshot,
      setReady,
      track,
      each: Effect.fn("ServerRuntime.each")(
        function* <A>(
          values: readonly A[],
          task: (value: A) => Effect.Effect<void, ServerRuntimeFailure>,
        ) {
          const first = yield* Ref.make<Exit.Exit<void, ServerRuntimeFailure> | undefined>(
            undefined,
          );
          yield* Effect.forEach(
            values,
            (value) =>
              Effect.gen(function* () {
                const result = yield* Effect.exit(
                  Effect.gen(function* () {
                    if ((yield* Ref.get(state)).stopping)
                      return yield* Effect.fail(
                        new ServerRuntimeFailure({
                          operation: "batch",
                          cause: new Error("Runtime is stopping."),
                        }),
                      );
                    yield* task(value);
                  }),
                );
                if (Exit.isFailure(result))
                  yield* Ref.update(first, (current) => current ?? result);
              }),
            { concurrency: 16, discard: true },
          );
          const failure = yield* Ref.get(first);
          if (failure !== undefined && Exit.isFailure(failure))
            return yield* Effect.failCause(failure.cause);
        },
        (effect, values) =>
          observeExecution("runtime", "server.batch", effect, () => ({ entries: values.length })),
      ),
      shutdown,
      awaitReady: Effect.fn("ServerRuntime.awaitReady")(
        (area: RuntimeArea) => Deferred.await(readiness[area]),
        (effect) => observeExecution("runtime", "server.await-ready", effect),
      ),
      resource: Effect.fn("ServerRuntime.resource")(function* <A>(
        operation: string,
        acquire: Effect.Effect<A, ServerRuntimeFailure, Scope.Scope>,
        initialize: (value: A) => Effect.Effect<void, ServerRuntimeFailure>,
        phase: "worker" | "application" | "telemetry" = "application",
      ) {
        const fiber = yield* acquireRuntimeResource(
          environment,
          state,
          phase === "worker"
            ? workerResources
            : phase === "telemetry"
              ? telemetryResources
              : resources,
          operation,
          acquire,
          initialize,
        ).pipe(Effect.forkIn(workers));
        return yield* Fiber.join(fiber);
      }),
      worker: (operation, pass) => forkRuntimeWorker(environment, state, workers, operation, pass),
      retry: (operation, action) =>
        retryRuntimeRegistration(environment, state, workers, operation, action),
      providerDelay: Effect.fn("ServerRuntime.providerDelay")(
        () => Effect.sleep(environment.providerDelayMs),
        (effect) => observeExecution("runtime", "server.provider-delay", effect),
      ),
      failure: Effect.fn("ServerRuntime.failure")(
        (failure, cleanup = false) => recordFailure(environment, state, failure, cleanup),
        (effect) => observeExecution("runtime", "server.failure", effect),
      ),
      cleanup: Effect.fn("ServerRuntime.cleanup")(
        (operation, task) =>
          boundedCleanup(
            environment,
            state,
            operation,
            task,
            operation.startsWith("telemetry")
              ? environment.telemetryTimeoutMs
              : environment.drainTimeoutMs,
          ),
        (effect) => observeExecution("runtime", "server.cleanup", effect),
      ),
    });
  }),
);

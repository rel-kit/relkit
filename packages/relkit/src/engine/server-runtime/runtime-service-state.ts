/** Allocates all generation state before exposing startup, readiness or worker operations. */
import { Deferred, Effect, Ref, Scope } from "effect";
import { RuntimeEnvironment } from "./runtime-environment.js";
import type { RuntimeSnapshot } from "./server-runtime.types.js";
import type { RuntimeServiceState } from "./runtime-service-state.types.js";
import type { RuntimeCompletionReceipt } from "./runtime-completion.types.js";

/** @returns One generation state whose child scopes belong to the live layer owner. */
export const makeRuntimeServiceState = Effect.fn("ServerRuntime.state")(function* () {
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
  const active = yield* Ref.make<ReadonlySet<RuntimeCompletionReceipt>>(new Set());
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
  return {
    environment,
    owner,
    resources,
    telemetryResources,
    workerResources,
    workers,
    state,
    active,
    completion,
    readiness,
  } satisfies RuntimeServiceState;
});

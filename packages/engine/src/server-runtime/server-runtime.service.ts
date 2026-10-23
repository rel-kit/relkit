/**
 * Owns one production generation's readiness, native completions, resources and
 * worker scopes. The live layer requires an explicit replaceable environment.
 */
import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { boundedCleanup, recordFailure } from "./runtime-cleanup.js";
import { closeRuntimeGeneration } from "./runtime-shutdown.js";
import { forkRuntimeWorker, retryRuntimeRegistration } from "./runtime-workers.js";
import { makeRuntimeServiceState } from "./runtime-service-state.js";
import {
  runtimeSnapshot,
  publishRuntimeReadiness,
  awaitRuntimeReadiness,
} from "./runtime-readiness.js";
import { trackRuntimeInvocation, eachRuntimeInvocation } from "./runtime-invocations.js";
import { acquireRuntimeServiceResource } from "./runtime-service-resources.js";
import type { ServerRuntimeOperations } from "./server-runtime.types.js";
import type { RuntimeServiceState } from "./runtime-service-state.types.js";

/** Lifecycle authority; make captures shared environment and scope once per layer. */
export class ServerRuntime extends Context.Service<ServerRuntime, ServerRuntimeOperations>()(
  "@relkit/cli/ServerRuntime",
  {
    make: Effect.gen(function* () {
      return runtimeOperations(yield* makeRuntimeServiceState());
    }),
  },
) {}

/** @param owner - Acquired generation state. @returns The established lifecycle service operations. */
function runtimeOperations(owner: RuntimeServiceState): ServerRuntimeOperations {
  const { environment, state, workers } = owner;
  return {
    snapshot: () => runtimeSnapshot(owner),
    setReady: (area, ready) => publishRuntimeReadiness(owner, area, ready),
    awaitReady: (area) => awaitRuntimeReadiness(owner, area),
    track: (task) => trackRuntimeInvocation(owner, task),
    each: (values, task) => eachRuntimeInvocation(owner, values, task),
    resource: (operation, acquire, initialize, phase) =>
      acquireRuntimeServiceResource(owner, operation, acquire, initialize, phase),
    shutdown: (beforeRelease, beforeTelemetry) =>
      closeRuntimeGeneration(owner, beforeRelease, beforeTelemetry),
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
  };
}

/** One layer scope owns all generation resources and physical receipt fibers. */
export const ServerRuntimeLive = Layer.effect(ServerRuntime, ServerRuntime.make);

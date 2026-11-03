/** Selects each resource release phase while acquisitions remain in the generation worker scope. */
import { Effect, Fiber, type Scope } from "effect";
import { acquireRuntimeResource } from "./runtime-resources.js";
import type { RuntimeServiceState } from "./runtime-service-state.types.js";
import type { ServerRuntimeFailure } from "./server-runtime.schemas.js";

/** @typeParam A - Native handle. @param owner - Generation authority. @param operation - Fixed identity. @param acquire - Scoped native acquisition. @param initialize - Materialization after release registration. @param phase - Ordered release group. @returns Initialized handle or original typed startup failure. */
export const acquireRuntimeServiceResource = Effect.fn("ServerRuntime.resource")(function* <A>(
  owner: RuntimeServiceState,
  operation: string,
  acquire: Effect.Effect<A, ServerRuntimeFailure, Scope.Scope>,
  initialize: (value: A) => Effect.Effect<void, ServerRuntimeFailure>,
  phase: "worker" | "application" | "telemetry" = "application",
) {
  let scope = owner.resources;
  if (phase === "worker") scope = owner.workerResources;
  if (phase === "telemetry") scope = owner.telemetryResources;
  const fiber = yield* acquireRuntimeResource(
    owner.environment,
    owner.state,
    scope,
    operation,
    acquire,
    initialize,
  ).pipe(Effect.forkIn(owner.workers));
  return yield* Fiber.join(fiber);
});

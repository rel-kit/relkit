/**
 * Owns the prepared backend's activation gate and independent telemetry worker.
 * Ingress is acquired by the caller; persistent startup waits for activation.
 * Registration order ensures backend producers retire before support flushes.
 */
import { Deferred, Effect } from "effect";
import { makeDevSessionEngineEffect } from "../commands/dev-session-engine.js";
import { preparedSupportStartupDelayMs } from "./snapshot-session-options.js";
import type { DevSession } from "../commands/dev-session.js";
import type { DevTelemetryRelay } from "../commands/dev-telemetry-relay.types.js";

/**
 * Starts backend activation with support registered earlier in the same owner Scope.
 * @param session - Prepared session whose engine owns its backend and inspector.
 * @param telemetry - Ingress already active; storage waits for successful activation.
 * @returns Started engine; LIFO cleanup stops producers before flushing support.
 */
export const activatePreparedSession = Effect.fn("DevSnapshot.activateSession")(function* (
  session: DevSession,
  telemetry: DevTelemetryRelay,
) {
  const backendActivated = yield* Deferred.make<void>();
  // Register first so LIFO release stops backend producers before the support flush.
  yield* Effect.forkScoped(
    Deferred.await(backendActivated).pipe(
      Effect.andThen(Effect.sleep(preparedSupportStartupDelayMs)),
      Effect.andThen(telemetry.run(session.log)),
    ),
  );
  const engine = yield* makeDevSessionEngineEffect(session);
  yield* engine.start;
  yield* Deferred.succeed(backendActivated, undefined);
  return engine;
});

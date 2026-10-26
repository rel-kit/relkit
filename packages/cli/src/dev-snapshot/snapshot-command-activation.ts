/**
 * Activates a prepared backend without a dev-owned persistent telemetry worker.
 * Session shutdown joins backend producers before the caller releases capture.
 */
import { Effect } from "effect";
import { makeDevSessionEngineEffect } from "../commands/dev-session-engine.js";
import type { DevSession } from "../commands/dev-session.js";

/**
 * Starts backend activation with support registered earlier in the same owner Scope.
 * @param session - Prepared session whose engine owns its backend and inspector.
 * @param telemetry - Ingress already active; storage waits for successful activation.
 * @returns Started engine; LIFO cleanup stops producers before flushing support.
 */
export const activatePreparedSession = Effect.fn("DevSnapshot.activateSession")(function* (
  session: DevSession,
) {
  const engine = yield* makeDevSessionEngineEffect(session);
  yield* engine.start;
  return engine;
});

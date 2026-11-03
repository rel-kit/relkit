/**
 * Exposes the shared durable thread transition table through the existing agent
 * telemetry boundary; provider implementations call the lower contracts owner.
 */
import { decideThreadTransitionEffect as sharedTransition } from "../contracts/index.js";
import type { ThreadAction, ThreadStatus } from "../contracts/index.js";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";

export type { AgentTransitionError, ThreadAction, ThreadTransition } from "../contracts/index.js";

/** Observes a shared thread decision without duplicating its state machine.
 * @param status - Persisted current thread state.
 * @param action - Requested durable control action.
 * @returns The accepted transition or rejection value, with no typed failure.
 */
export function decideThreadTransitionEffect(status: ThreadStatus, action: ThreadAction) {
  return observeAgent("thread-transition.decide", sharedTransition(status, action));
}

/** Decides a thread action for synchronous framework callers.
 * @param status - Persisted current state.
 * @param action - Requested durable control action.
 * @returns The unchanged shared transition result.
 */
export function decideThreadTransition(status: ThreadStatus, action: ThreadAction) {
  return Effect.runSync(decideThreadTransitionEffect(status, action));
}

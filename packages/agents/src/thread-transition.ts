import { Effect, Metric } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { ThreadStatus } from "./state.types.js";
import type {
  AgentTransitionError,
  ThreadAction,
  ThreadTransition,
} from "./thread-transition.types.js";

export type {
  AgentTransitionError,
  ThreadAction,
  ThreadTransition,
} from "./thread-transition.types.js";

const transitionCount = Metric.counter("relkit.agents.thread_transition.total");

/**
 * Decides a thread action inside a traced Effect and counts the decision.
 *
 * @param status - Current thread status.
 * @param action - Requested action.
 * @returns An Effect with the accepted transition or a rejection value; it has no typed failure.
 * @example
 * const result = Effect.runSync(decideThreadTransitionEffect("idle", "send"));
 */
export const decideThreadTransitionEffect = Effect.fn("Agents.decideThreadTransition")(function* (
  status: ThreadStatus,
  action: ThreadAction,
) {
  const transition = yield* Effect.sync((): ThreadTransition => {
    const reject = (code: AgentTransitionError): ThreadTransition => ({
      accepted: false,
      status,
      code,
    });
    if (status === "idle") {
      return action === "send"
        ? { accepted: true, nextStatus: "running", idempotent: false }
        : reject("AGENT_INVALID_CONTROL");
    }
    if (status === "running") {
      if (action === "steer" || action === "follow-up") {
        return { accepted: true, nextStatus: "running", idempotent: false };
      }
      if (action === "stop") {
        return { accepted: true, nextStatus: "stopping", idempotent: false };
      }
      return reject(action === "send" ? "AGENT_BUSY" : "AGENT_INVALID_CONTROL");
    }
    if (status === "approval-interrupted") {
      if (action === "approve" || action === "deny") {
        return { accepted: true, nextStatus: "running", idempotent: false };
      }
      if (action === "stop") {
        return { accepted: true, nextStatus: "idle", idempotent: false };
      }
      return reject(action === "send" ? "AGENT_APPROVAL_REQUIRED" : "AGENT_INVALID_CONTROL");
    }
    if (status === "stopping") {
      return action === "stop"
        ? { accepted: true, nextStatus: "stopping", idempotent: true }
        : reject(action === "send" ? "AGENT_STOPPING" : "AGENT_INVALID_CONTROL");
    }
    return reject(action === "send" ? "AGENT_WORKER_INTERRUPTED" : "AGENT_INVALID_CONTROL");
  });
  yield* Metric.update(transitionCount, 1);
  return transition;
}, (effect) => observeAgent("thread-transition.decide", effect));

/**
 * Synchronously decides a thread action for existing callers.
 *
 * @param status - Current thread status.
 * @param action - Requested action.
 * @returns The accepted transition or a rejection value.
 * @example
 * const result = decideThreadTransition("idle", "send");
 */
export function decideThreadTransition(
  status: ThreadStatus,
  action: ThreadAction,
): ThreadTransition {
  return Effect.runSync(decideThreadTransitionEffect(status, action));
}

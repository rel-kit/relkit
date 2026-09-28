import type { ThreadStatus } from "./state.types.js";

/** Actions that a caller may request for an agent thread. */
export type ThreadAction = "send" | "steer" | "follow-up" | "stop" | "approve" | "deny";

/** Stable rejection codes returned for invalid thread actions. */
export type AgentTransitionError =
  | "AGENT_BUSY"
  | "AGENT_APPROVAL_REQUIRED"
  | "AGENT_STOPPING"
  | "AGENT_WORKER_INTERRUPTED"
  | "AGENT_INVALID_CONTROL";

/** The accepted next state or the reason the current state cannot advance. */
export type ThreadTransition =
  | { readonly accepted: true; readonly nextStatus: ThreadStatus; readonly idempotent: boolean }
  | {
      readonly accepted: false;
      readonly status: ThreadStatus;
      readonly code: AgentTransitionError;
    };

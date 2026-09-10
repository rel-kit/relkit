import type { ThreadStatus } from "./state-types.js";

export type ThreadAction = "send" | "steer" | "follow-up" | "stop" | "approve" | "deny";
export type AgentTransitionError =
  | "AGENT_BUSY"
  | "AGENT_APPROVAL_REQUIRED"
  | "AGENT_STOPPING"
  | "AGENT_WORKER_INTERRUPTED"
  | "AGENT_INVALID_CONTROL";

export type ThreadTransition =
  | { readonly accepted: true; readonly nextStatus: ThreadStatus; readonly idempotent: boolean }
  | {
      readonly accepted: false;
      readonly status: ThreadStatus;
      readonly code: AgentTransitionError;
    };

export function decideThreadTransition(
  status: ThreadStatus,
  action: ThreadAction,
): ThreadTransition {
  if (status === "idle") {
    return action === "send"
      ? { accepted: true, nextStatus: "running", idempotent: false }
      : reject(status, "AGENT_INVALID_CONTROL");
  }
  if (status === "running") {
    if (action === "steer" || action === "follow-up") {
      return { accepted: true, nextStatus: "running", idempotent: false };
    }
    if (action === "stop") {
      return { accepted: true, nextStatus: "stopping", idempotent: false };
    }
    return reject(status, action === "send" ? "AGENT_BUSY" : "AGENT_INVALID_CONTROL");
  }
  if (status === "approval-interrupted") {
    if (action === "approve" || action === "deny") {
      return { accepted: true, nextStatus: "running", idempotent: false };
    }
    if (action === "stop") {
      return { accepted: true, nextStatus: "idle", idempotent: false };
    }
    return reject(status, action === "send" ? "AGENT_APPROVAL_REQUIRED" : "AGENT_INVALID_CONTROL");
  }
  if (status === "stopping") {
    return action === "stop"
      ? { accepted: true, nextStatus: "stopping", idempotent: true }
      : reject(status, action === "send" ? "AGENT_STOPPING" : "AGENT_INVALID_CONTROL");
  }
  return reject(status, action === "send" ? "AGENT_WORKER_INTERRUPTED" : "AGENT_INVALID_CONTROL");
}

function reject(status: ThreadStatus, code: AgentTransitionError): ThreadTransition {
  return { accepted: false, status, code };
}

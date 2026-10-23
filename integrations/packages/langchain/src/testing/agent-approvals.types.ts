/** Exercises native agent approval continuations through the harness's scoped model and execution owner, retaining resume identity and cleanup. This companion preserves the native input and output types without starting runtime work. */

import type { AgentApprovalHandler } from "../index.js";
import type { Deferred } from "effect";
import type { TestAgentApprovals } from "./agents-types.js";

/** Deferred decision authority and its native cancellation listener. */
export interface PendingAgentDecision {
  readonly done: Deferred.Deferred<"approved" | "denied">;
  readonly signal?: AbortSignal;
  readonly abort: () => void;
}

/** Synchronous controls over owned native approval decisions and cancellation. */
export interface AgentApprovalState extends TestAgentApprovals {
  readonly handler?: AgentApprovalHandler;
  readonly reset: () => void;
  readonly registerSignal: (id: string, signal: AbortSignal) => void;
  readonly releaseSignal: (id: string) => void;
}

/** Native callback state retained by one test approval owner. */
export interface AgentApprovalOwnedState {
  readonly pending: Map<string, import("../index.js").PendingApproval>;
  readonly decisions: Map<string, PendingAgentDecision>;
  readonly signals: Map<string, AbortSignal>;
}

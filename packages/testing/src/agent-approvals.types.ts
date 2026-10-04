import type { AgentApprovalHandler } from "@relkit/agents";
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

import type { PendingApproval } from "@relkit/agents";
import type { agentContext } from "./agent-rpc-support.js";
import type { Deferred } from "effect";
import type { HttpBoundaryError } from "./http-effect.js";

/** Authorized agent descriptor, provider and immutable durable request scope. */
export type ResolvedAgent = Awaited<ReturnType<typeof agentContext>>;

/** Contract for waiting approval used by agent approval coordinator. */
export interface WaitingApproval {
  readonly approval: PendingApproval;
  readonly approvalId: string;
  interruptSetDigest?: string;
  readonly decision: Deferred.Deferred<"approved" | "denied", HttpBoundaryError>;
}

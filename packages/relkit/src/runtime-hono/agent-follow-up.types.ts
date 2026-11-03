import type { agentContext } from "./agent-rpc-support.js";

/** Authorized agent descriptor, provider and immutable durable request scope. */
export type ResolvedAgent = Awaited<ReturnType<typeof agentContext>>;

/** Contract for next agent run used by agent follow up. */
export interface NextAgentRun {
  readonly receipt: Awaited<ReturnType<ResolvedAgent["provider"]["acceptRun"]>>;
  readonly input: unknown;
  readonly controlRunIds: readonly string[];
}

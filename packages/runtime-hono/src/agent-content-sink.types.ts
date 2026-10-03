import type { AgentContentSink } from "@relkit/agents";
import type { agentContext } from "./agent-rpc-support.js";

/** Authorized agent descriptor, provider and immutable durable request scope. */
export type ResolvedAgent = Awaited<ReturnType<typeof agentContext>>;

/** Contract for agent journal sink used by agent content sink. */
export interface AgentJournalSink extends AgentContentSink {
  readonly ensureOutput: (value: unknown, signal: AbortSignal) => Promise<void>;
  readonly isWaiting: () => boolean;
}

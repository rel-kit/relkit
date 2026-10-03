import type { agentContext } from "./agent-rpc-support.js";

/** Authorized agent descriptor, provider and immutable durable request scope. */
export type ResolvedAgent = Awaited<ReturnType<typeof agentContext>>;

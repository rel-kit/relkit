import type { AgentRequestScope } from "@relkit/agents";

/** Scoped recovery request identifying the thread and optional run. */
export type RecoveryRequest = AgentRequestScope & { readonly threadId: string };

/** Defines the persisted run identities required for expired execution recovery. */
import type { AgentRequestScope } from "@relkit/contracts";

/** Scoped recovery request identifying the thread and optional run. */
export type RecoveryRequest = AgentRequestScope & { readonly threadId: string };

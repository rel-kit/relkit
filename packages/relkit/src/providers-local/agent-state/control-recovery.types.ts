/** Defines the immutable control identities consumed by lease recovery. */
import type { AgentRequestScope } from "../../contracts/index.js";

/** Scoped recovery request identifying the thread and optional run. */
export type RecoveryRequest = AgentRequestScope & { readonly threadId: string };

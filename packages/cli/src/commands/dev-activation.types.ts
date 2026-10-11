/** Attempt state belongs to one activation Scope, never another generation. */
import type { Ref } from "effect";
import type { SupervisorCandidateToken } from "@relkit/supervisor";
import type { DevSession } from "./dev-session.js";

/** Admitted source version with cancellation and promotion witnesses. */
export interface DevActivationAttempt {
  readonly session: DevSession;
  readonly token: SupervisorCandidateToken;
  readonly version: number;
  readonly changedFiles: readonly string[];
  readonly initial: boolean;
  readonly startedAt: number;
  readonly signal: AbortSignal;
  readonly promoted: Ref.Ref<boolean>;
}

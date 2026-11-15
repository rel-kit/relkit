/** Attempt state belongs to one activation Scope, never another generation. */
import type { Ref } from "effect";
import type { SupervisorCandidateToken } from "../supervisor/index.js";
import type { DevSession } from "./dev-session.js";
import type { DevLogEvent } from "./dev.types.js";

/** Candidate output held while a reload is unverified. */
export interface HeldCandidateOutput {
  /** Held events; undefined once released, after which output is logged as it arrives. */
  events: DevLogEvent[] | undefined;
  /** Set when the process exited and its output went into the failure: later output is dropped. */
  dropped: boolean;
  /** The last coded failure the process logged, which names the cause should it then exit. */
  diagnostic?: { readonly code: string; readonly detail: string };
}

/**
 * Why a generation changed: `start` for the session's first one, `reload` for handlers swapped
 * inside the serving process, `restart` for a new process (blue/green) after a change.
 */
export type DevGenerationReason = "start" | "reload" | "restart";

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
  /** Candidate output held until the generation is verified. */
  readonly output: HeldCandidateOutput;
}

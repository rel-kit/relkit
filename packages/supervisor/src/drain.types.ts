import type { StartedCandidate } from "./candidate.types.js";
import type { LoggerOptions } from "@relkit/runtime-effect/logger";
import type { SupervisorCandidateToken, SupervisorStateSnapshot } from "./state-machine.types.js";

/** Closes a native resource. @returns Native settlement; zero-argument owners retain cancellation authority. */
export type SupervisorDrainAction = () => void | PromiseLike<void>;

/** Existing provider cleanup aliases, selected in close/release/dispose precedence. */
export interface SupervisorDrainResource {
  readonly id?: string;
  readonly close?: SupervisorDrainAction;
  readonly release?: SupervisorDrainAction;
  readonly dispose?: SupervisorDrainAction;
}

/** Native generation work interrupted after the shared drain deadline. */
export interface SupervisorDrainWorkOptions {
  /** Requests native interruption. @param reason - Owner deadline or shutdown reason. @returns Native acknowledgment when available. */
  readonly interrupt?: (reason: unknown) => void | PromiseLike<void>;
}

/** One admitted generation borrow with an owner-issued signal and idempotent release. */
export interface SupervisorDrainLease {
  readonly token: SupervisorCandidateToken;
  readonly signal: AbortSignal;
  /** Acknowledges completion once. @returns Nothing; retained counts update synchronously even after reporting. */
  readonly release: () => void;
}

/** Truthful cleanup settlement; timed-out never claims physical resource exit. */
export type SupervisorDrainCleanupStatus = "not-configured" | "closed" | "failed" | "timed-out";

/** Cleanup evidence presented in original provider registration order. */
export interface SupervisorDrainResourceResult {
  readonly id: string;
  readonly status: SupervisorDrainCleanupStatus;
}

/** Existing bounded shutdown outcome vocabulary. */
export type SupervisorDrainOutcome = "drained" | "interrupted" | "timed-out" | "failed";
/** Whether the active state-machine witness still owned completion. */
export type SupervisorDrainStateTransition = "not-configured" | "completed" | "stale";

/** Bounded native resource failure diagnostic. */
export interface SupervisorDrainFailure {
  readonly resource: string;
  readonly message: string;
}

/** Immutable shared-deadline cleanup evidence and in-flight acknowledgments. */
export interface SupervisorDrainReport {
  readonly token: SupervisorCandidateToken;
  readonly deadlineMs: number;
  readonly elapsedMs: number;
  readonly initialInFlight: number;
  readonly completed: number;
  readonly interrupted: number;
  readonly remaining: number;
  readonly timedOut: boolean;
  readonly outcome: SupervisorDrainOutcome;
  readonly candidate: SupervisorDrainCleanupStatus;
  readonly providers: readonly SupervisorDrainResourceResult[];
  readonly failures: readonly SupervisorDrainFailure[];
  readonly stateTransition: SupervisorDrainStateTransition;
}

/** Once-acquired retired generation owners, explicit clock override and shutdown policy. */
export interface SupervisorDrainOptions {
  readonly logger?: LoggerOptions;
  readonly token: SupervisorCandidateToken;
  readonly deadlineMs?: number;
  /** Overrides injected deadline time. @returns Milliseconds in the owner's consistent clock domain. */
  readonly now?: () => number;
  readonly candidate?: Pick<StartedCandidate, "token" | "dispose">;
  readonly providers?: readonly SupervisorDrainResource[];
  /** Consumes completed evidence without lifecycle authority. @param report - Immutable shutdown report. */
  readonly onReport?: (report: SupervisorDrainReport) => void;
}

/** Synchronous state witnesses used to complete the existing drain transition. */
export interface SupervisorDrainStateMachine {
  /** Reads the active and retired witnesses. @returns The current committed snapshot. */
  readonly snapshot: () => SupervisorStateSnapshot;
  /** Completes a successful retired drain. @param token - Active witness. @returns Whether that witness still owns completion. */
  readonly drainSucceeded: (token: SupervisorCandidateToken) => boolean;
  /** Completes a failed retired drain. @param token - Active witness. @param reason - Original failure evidence.
   * @returns Whether that witness still owns completion. */
  readonly drainFailed: (token: SupervisorCandidateToken, reason: unknown) => boolean;
}

/** Retired/active generation witnesses and their native cleanup capabilities. */
export interface DrainPreviousGenerationOptions extends SupervisorDrainOptions {
  readonly activeToken: SupervisorCandidateToken;
  readonly stateMachine: SupervisorDrainStateMachine;
}

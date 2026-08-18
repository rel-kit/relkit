import type { StartedCandidate } from "./candidate-types.js";
import type { SupervisorCandidateToken, SupervisorStateSnapshot } from "./state-machine-types.js";

export type SupervisorDrainAction = () => void | PromiseLike<void>;

export interface SupervisorDrainResource {
  readonly id?: string;
  readonly close?: SupervisorDrainAction;
  readonly release?: SupervisorDrainAction;
  readonly dispose?: SupervisorDrainAction;
}

export interface SupervisorDrainWorkOptions {
  readonly interrupt?: (reason: unknown) => void | PromiseLike<void>;
}

export interface SupervisorDrainLease {
  readonly token: SupervisorCandidateToken;
  readonly signal: AbortSignal;
  readonly release: () => void;
}

export type SupervisorDrainCleanupStatus = "not-configured" | "closed" | "failed" | "timed-out";

export interface SupervisorDrainResourceResult {
  readonly id: string;
  readonly status: SupervisorDrainCleanupStatus;
}

export type SupervisorDrainOutcome = "drained" | "interrupted" | "timed-out" | "failed";
export type SupervisorDrainStateTransition = "not-configured" | "completed" | "stale";

export interface SupervisorDrainFailure {
  readonly resource: string;
  readonly message: string;
}

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

export interface SupervisorDrainOptions {
  readonly token: SupervisorCandidateToken;
  readonly deadlineMs?: number;
  readonly now?: () => number;
  readonly candidate?: Pick<StartedCandidate, "token" | "dispose">;
  readonly providers?: readonly SupervisorDrainResource[];
  readonly onReport?: (report: SupervisorDrainReport) => void;
}

export interface SupervisorDrainStateMachine {
  readonly snapshot: () => SupervisorStateSnapshot;
  readonly drainSucceeded: (token: SupervisorCandidateToken) => boolean;
  readonly drainFailed: (token: SupervisorCandidateToken, reason: unknown) => boolean;
}

export interface DrainPreviousGenerationOptions extends SupervisorDrainOptions {
  readonly activeToken: SupervisorCandidateToken;
  readonly stateMachine: SupervisorDrainStateMachine;
}

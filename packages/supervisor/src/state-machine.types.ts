import type { LoggerOptions } from "@relkit/runtime-effect/logger";
import type {
  SupervisorCandidateTokenSchema,
  SupervisorStateSchema,
} from "./state-machine.schemas.js";

/** Public state vocabulary derived from its schema authority. */
export type SupervisorState = typeof SupervisorStateSchema.Type;

/** Positive safe-integer candidate identity decoded at supervisor boundaries. */
export type SupervisorCandidateToken = typeof SupervisorCandidateTokenSchema.Type;

/** Existing lifecycle stage vocabulary. */
export type SupervisorPhase = "compile" | "start" | "verification" | "switch" | "drain";
/** Existing bounded native lifecycle outcomes, separate from operation telemetry. */
export type SupervisorOutcomeName =
  | "compile-succeeded"
  | "compile-failed"
  | "start-succeeded"
  | "start-failed"
  | "verification-succeeded"
  | "verification-failed"
  | "switch-succeeded"
  | "switch-failed"
  | "drain-succeeded"
  | "drain-failed"
  | "candidate-stale";

/** Immutable sequence-ordered state transition evidence. */
export interface SupervisorTransitionTelemetry {
  readonly type: "transition";
  readonly sequence: number;
  readonly from: SupervisorState;
  readonly to: SupervisorState;
  readonly sourceToken: number;
  readonly generationToken: number;
}

/** Immutable candidate outcome with bounded compatibility error detail. */
export interface SupervisorOutcomeTelemetry {
  readonly type: "outcome";
  readonly sequence: number;
  readonly phase: SupervisorPhase;
  readonly outcome: SupervisorOutcomeName;
  readonly sourceToken: number;
  readonly generationToken: number;
  readonly previousGeneration?: SupervisorCandidateToken;
  readonly returnState?: SupervisorState;
  readonly error?: { readonly code?: string; readonly message: string };
}

/** Original transition/outcome record union. */
export type SupervisorTelemetry = SupervisorTransitionTelemetry | SupervisorOutcomeTelemetry;
/** Consumes committed lifecycle evidence. @param event - Sequence-ordered immutable record. */
export type SupervisorTelemetryListener = (event: SupervisorTelemetry) => void;

/** Complete atomic activation state with candidate/active/retired generation witnesses. */
export interface SupervisorStateSnapshot {
  readonly state: SupervisorState;
  readonly sourceToken: number;
  readonly generationToken: number;
  readonly candidate: SupervisorCandidateToken | undefined;
  readonly activeGeneration: SupervisorCandidateToken | undefined;
  readonly previousGeneration: SupervisorCandidateToken | undefined;
}

/** Initial native generation and isolated evidence/logging configuration. */
export interface SupervisorStateMachineOptions {
  readonly activeGeneration?: SupervisorCandidateToken;
  readonly onTelemetry?: SupervisorTelemetryListener;
  /** Operation sinks and thresholds; lifecycle evidence still uses onTelemetry. */
  readonly logger?: LoggerOptions;
}

/** Candidate phases preceding switching and retired-generation drain. */
export type SupervisorCandidatePhase = Exclude<SupervisorPhase, "switch" | "drain">;
/** Pure phase-transition policy retaining public state/outcome names. */
export interface SupervisorCandidateStep {
  readonly expected: SupervisorState;
  readonly next: SupervisorState;
  readonly success: SupervisorOutcomeName;
  readonly failure: SupervisorOutcomeName;
}

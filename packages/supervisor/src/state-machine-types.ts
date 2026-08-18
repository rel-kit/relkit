export const SUPERVISOR_STATES = [
  "idle",
  "compiling-candidate",
  "starting-candidate",
  "verifying-hash-and-readiness",
  "switching",
  "draining-previous",
  "active",
] as const;

export type SupervisorState = (typeof SUPERVISOR_STATES)[number];
export type SupervisorPhase = "compile" | "start" | "verification" | "switch" | "drain";
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

export interface SupervisorCandidateToken {
  readonly sourceToken: number;
  readonly generationToken: number;
}

export interface SupervisorTransitionTelemetry {
  readonly type: "transition";
  readonly sequence: number;
  readonly from: SupervisorState;
  readonly to: SupervisorState;
  readonly sourceToken: number;
  readonly generationToken: number;
}

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

export type SupervisorTelemetry = SupervisorTransitionTelemetry | SupervisorOutcomeTelemetry;
export type SupervisorTelemetryListener = (event: SupervisorTelemetry) => void;

export interface SupervisorStateSnapshot {
  readonly state: SupervisorState;
  readonly sourceToken: number;
  readonly generationToken: number;
  readonly candidate: SupervisorCandidateToken | undefined;
  readonly activeGeneration: SupervisorCandidateToken | undefined;
  readonly previousGeneration: SupervisorCandidateToken | undefined;
}

export interface SupervisorStateMachineOptions {
  readonly activeGeneration?: SupervisorCandidateToken;
  readonly onTelemetry?: SupervisorTelemetryListener;
}

export type SupervisorCandidatePhase = Exclude<SupervisorPhase, "switch" | "drain">;
export interface SupervisorCandidateStep {
  readonly expected: SupervisorState;
  readonly next: SupervisorState;
  readonly success: SupervisorOutcomeName;
  readonly failure: SupervisorOutcomeName;
}
export const SUPERVISOR_CANDIDATE_STEPS: Record<SupervisorCandidatePhase, SupervisorCandidateStep> =
  {
    compile: {
      expected: "compiling-candidate",
      next: "starting-candidate",
      success: "compile-succeeded",
      failure: "compile-failed",
    },
    start: {
      expected: "starting-candidate",
      next: "verifying-hash-and-readiness",
      success: "start-succeeded",
      failure: "start-failed",
    },
    verification: {
      expected: "verifying-hash-and-readiness",
      next: "switching",
      success: "verification-succeeded",
      failure: "verification-failed",
    },
  };

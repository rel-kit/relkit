export * from "./state-machine-types.js";
import {
  type SupervisorCandidateToken,
  type SupervisorCandidatePhase,
  type SupervisorOutcomeName,
  type SupervisorPhase,
  type SupervisorState,
  type SupervisorStateMachineOptions,
  type SupervisorStateSnapshot,
  type SupervisorTelemetry,
  type SupervisorTelemetryListener,
} from "./state-machine-types.js";
import { SUPERVISOR_CANDIDATE_STEPS } from "./state-machine-types.js";
import { SupervisorTelemetryLog, validateSupervisorToken } from "./state-machine-telemetry.js";

/** Pure lifecycle state and token coordination for candidate activation. */
export class SupervisorStateMachine {
  private currentState: SupervisorState;
  private sourceSequence = 0;
  private generationSequence = 0;
  private candidate: SupervisorCandidateToken | undefined;
  private activeGeneration: SupervisorCandidateToken | undefined;
  private previousGeneration: SupervisorCandidateToken | undefined;
  private readonly telemetryLog: SupervisorTelemetryLog;

  constructor(options: SupervisorStateMachineOptions = {}) {
    const active = options.activeGeneration;
    if (active !== undefined) {
      validateSupervisorToken(active);
      this.activeGeneration = Object.freeze({ ...active });
      this.sourceSequence = active.sourceToken;
      this.generationSequence = active.generationToken;
    }
    this.currentState = this.activeGeneration === undefined ? "idle" : "active";
    this.telemetryLog = new SupervisorTelemetryLog(options.onTelemetry);
  }

  get state(): SupervisorState {
    return this.currentState;
  }

  get sourceToken(): number {
    return this.sourceSequence;
  }

  get generationToken(): number {
    return this.generationSequence;
  }

  get telemetry(): readonly SupervisorTelemetry[] {
    return this.telemetryLog.records;
  }

  snapshot(): SupervisorStateSnapshot {
    return Object.freeze({
      state: this.currentState,
      sourceToken: this.sourceSequence,
      generationToken: this.generationSequence,
      candidate: this.candidate,
      activeGeneration: this.activeGeneration,
      previousGeneration: this.previousGeneration,
    });
  }

  subscribe(listener: SupervisorTelemetryListener): () => void {
    return this.telemetryLog.subscribe(listener);
  }

  requestSourceChange(): SupervisorCandidateToken {
    const token = Object.freeze({
      sourceToken: ++this.sourceSequence,
      generationToken: ++this.generationSequence,
    });
    this.candidate = token;
    this.transition("compiling-candidate", token);
    return token;
  }

  compileSucceeded(token: SupervisorCandidateToken): boolean {
    return this.finishCandidate(token, "compile", true);
  }

  compileFailed(token: SupervisorCandidateToken, reason: unknown): boolean {
    return this.finishCandidate(token, "compile", false, reason);
  }

  startSucceeded(token: SupervisorCandidateToken): boolean {
    return this.finishCandidate(token, "start", true);
  }

  startFailed(token: SupervisorCandidateToken, reason: unknown): boolean {
    return this.finishCandidate(token, "start", false, reason);
  }

  verificationSucceeded(token: SupervisorCandidateToken): boolean {
    return this.finishCandidate(token, "verification", true);
  }

  verificationFailed(token: SupervisorCandidateToken, reason: unknown): boolean {
    return this.finishCandidate(token, "verification", false, reason);
  }

  switchSucceeded(token: SupervisorCandidateToken): boolean {
    if (!this.check(token, "switching", "switch")) return false;
    const previous = this.activeGeneration;
    this.telemetryLog.outcome("switch", "switch-succeeded", token, undefined, undefined, previous);
    this.activeGeneration = token;
    this.candidate = undefined;
    this.previousGeneration = previous;
    this.transition(previous === undefined ? "active" : "draining-previous", token);
    return true;
  }

  switchFailed(token: SupervisorCandidateToken, reason: unknown): boolean {
    return this.finishCandidate(token, "switch", false, reason);
  }

  drainSucceeded(token: SupervisorCandidateToken): boolean {
    return this.finishDrain(token, "drain-succeeded");
  }

  drainFailed(token: SupervisorCandidateToken, reason: unknown): boolean {
    return this.finishDrain(token, "drain-failed", reason);
  }

  private finishCandidate(
    token: SupervisorCandidateToken,
    phase: SupervisorCandidatePhase | "switch",
    success: boolean,
    reason?: unknown,
  ): boolean {
    const step = phase === "switch" ? undefined : SUPERVISOR_CANDIDATE_STEPS[phase];
    const expected = step?.expected ?? "switching";
    if (!this.check(token, expected, phase)) return false;
    const next = success
      ? (step?.next ?? "active")
      : this.activeGeneration === undefined
        ? "idle"
        : "active";
    this.telemetryLog.outcome(
      phase,
      success ? (step?.success ?? "switch-succeeded") : (step?.failure ?? "switch-failed"),
      token,
      reason,
      success ? undefined : next,
    );
    if (!success) this.candidate = undefined;
    this.transition(next, token);
    return true;
  }

  private finishDrain(
    token: SupervisorCandidateToken,
    outcome: SupervisorOutcomeName,
    reason?: unknown,
  ): boolean {
    if (!this.check(token, "draining-previous", "drain", "active")) return false;
    const previous = this.previousGeneration;
    this.telemetryLog.outcome("drain", outcome, token, reason, undefined, previous);
    this.previousGeneration = undefined;
    this.transition("active", token);
    return true;
  }

  private check(
    token: SupervisorCandidateToken,
    expected: SupervisorState,
    phase: SupervisorPhase,
    owner: "candidate" | "active" = "candidate",
  ): boolean {
    validateSupervisorToken(token);
    const current = owner === "candidate" ? this.candidate : this.activeGeneration;
    if (
      current?.sourceToken !== token.sourceToken ||
      current.generationToken !== token.generationToken
    ) {
      this.telemetryLog.outcome(phase, "candidate-stale", token);
      return false;
    }
    if (this.currentState !== expected) {
      throw new Error(
        `Supervisor cannot transition from ${this.currentState}; expected ${expected}.`,
      );
    }
    return true;
  }

  private transition(to: SupervisorState, token: SupervisorCandidateToken): void {
    const from = this.currentState;
    this.currentState = to;
    this.telemetryLog.transition(from, to, token);
  }
}

export function createSupervisorStateMachine(
  options?: SupervisorStateMachineOptions,
): SupervisorStateMachine {
  return new SupervisorStateMachine(options);
}

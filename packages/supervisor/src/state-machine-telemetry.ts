import type {
  SupervisorCandidateToken,
  SupervisorOutcomeName,
  SupervisorOutcomeTelemetry,
  SupervisorPhase,
  SupervisorState,
  SupervisorTelemetry,
  SupervisorTelemetryListener,
} from "./state-machine-types.js";

export class SupervisorTelemetryLog {
  private sequence = 0;
  private readonly events: SupervisorTelemetry[] = [];
  private readonly listeners = new Set<SupervisorTelemetryListener>();

  constructor(listener?: SupervisorTelemetryListener) {
    if (listener !== undefined) this.listeners.add(listener);
  }

  get records(): readonly SupervisorTelemetry[] {
    return this.events.slice();
  }

  subscribe(listener: SupervisorTelemetryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  transition(from: SupervisorState, to: SupervisorState, token: SupervisorCandidateToken): void {
    this.emit({
      type: "transition",
      sequence: ++this.sequence,
      from,
      to,
      sourceToken: token.sourceToken,
      generationToken: token.generationToken,
    });
  }

  outcome(
    phase: SupervisorPhase,
    outcome: SupervisorOutcomeName,
    token: SupervisorCandidateToken,
    reason?: unknown,
    returnState?: SupervisorState,
    previousGeneration?: SupervisorCandidateToken,
  ): void {
    const error = reason === undefined ? undefined : errorDetails(reason);
    const event: SupervisorOutcomeTelemetry = {
      type: "outcome",
      sequence: ++this.sequence,
      phase,
      outcome,
      sourceToken: token.sourceToken,
      generationToken: token.generationToken,
      ...(previousGeneration === undefined ? {} : { previousGeneration }),
      ...(returnState === undefined ? {} : { returnState }),
      ...(error === undefined ? {} : { error }),
    };
    this.emit(event);
  }

  private emit(event: SupervisorTelemetry): void {
    this.events.push(Object.freeze(event));
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Telemetry consumers must not change lifecycle behavior.
      }
    }
  }
}

export function validateSupervisorToken(token: SupervisorCandidateToken): void {
  if (!Number.isSafeInteger(token.sourceToken) || token.sourceToken < 1) {
    throw new TypeError("Supervisor source tokens must be positive safe integers.");
  }
  if (!Number.isSafeInteger(token.generationToken) || token.generationToken < 1) {
    throw new TypeError("Supervisor generation tokens must be positive safe integers.");
  }
}

function errorDetails(reason: unknown): { readonly code?: string; readonly message: string } {
  if (reason instanceof Error) {
    const code = "code" in reason && typeof reason.code === "string" ? reason.code : undefined;
    return { ...(code === undefined ? {} : { code }), message: reason.message };
  }
  if (typeof reason === "string") return { message: reason };
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    const value = reason as { code?: unknown; message?: unknown };
    if (typeof value.message === "string") {
      return {
        ...(typeof value.code === "string" ? { code: value.code } : {}),
        message: value.message,
      };
    }
  }
  return { message: "Candidate lifecycle operation failed." };
}

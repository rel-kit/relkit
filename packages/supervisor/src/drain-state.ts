import { createSupervisorDrain, SupervisorDrainError } from "./drain.js";
import { validateSupervisorToken } from "./state-machine-telemetry.js";
import type { SupervisorCandidateToken } from "./state-machine-types.js";
import type { DrainPreviousGenerationOptions, SupervisorDrainReport } from "./drain-types.js";

/** Drains the token recorded by the 13.2 state machine and completes its drain transition. */
export async function drainPreviousGeneration(
  options: DrainPreviousGenerationOptions,
): Promise<SupervisorDrainReport> {
  validateSupervisorToken(options.activeToken);
  const snapshot = options.stateMachine.snapshot();
  if (
    snapshot.state !== "draining-previous" ||
    !sameToken(snapshot.previousGeneration, options.token) ||
    !sameToken(snapshot.activeGeneration, options.activeToken)
  ) {
    throw new SupervisorDrainError(
      snapshot.state === "draining-previous"
        ? "RELKIT_DRAIN_TOKEN_MISMATCH"
        : "RELKIT_DRAIN_STATE_INVALID",
      "The state machine no longer owns the retired generation.",
    );
  }
  const report = await createSupervisorDrain(options).drain();
  const completed =
    report.outcome === "drained"
      ? options.stateMachine.drainSucceeded(options.activeToken)
      : options.stateMachine.drainFailed(options.activeToken, report.outcome);
  return Object.freeze({ ...report, stateTransition: completed ? "completed" : "stale" });
}

function sameToken(
  left: SupervisorCandidateToken | undefined,
  right: SupervisorCandidateToken | undefined,
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.sourceToken === right.sourceToken &&
    left.generationToken === right.generationToken
  );
}

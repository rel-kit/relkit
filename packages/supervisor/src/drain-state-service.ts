import { Effect } from "effect";
import { SupervisorDrainOwner } from "./drain-service.js";
import { SupervisorDrainError } from "./drain-errors.js";
import { sameToken } from "./proxy-validation.js";
import { validateSupervisorToken } from "./state-machine-telemetry.js";
import type { DrainPreviousGenerationOptions, SupervisorDrainReport } from "./drain.types.js";

/**
 * Admits existing active/retired generation witnesses before native resource acquisition.
 * @param options - Existing state-machine witnesses.
 * @returns Synchronous typed validation; unexpected native getter defects remain defects.
 */
export const validatePreviousGeneration = Effect.fn("SupervisorDrain.validatePrevious")(
  (options: DrainPreviousGenerationOptions) =>
    Effect.try({
      try: () => {
        validateSupervisorToken(options.activeToken);
        const snapshot = options.stateMachine.snapshot();
        if (
          snapshot.state !== "draining-previous" ||
          !sameToken(snapshot.previousGeneration, options.token) ||
          !sameToken(snapshot.activeGeneration, options.activeToken)
        )
          throw new SupervisorDrainError(
            snapshot.state === "draining-previous"
              ? "RELKIT_DRAIN_TOKEN_MISMATCH"
              : "RELKIT_DRAIN_STATE_INVALID",
            "The state machine no longer owns the retired generation.",
          );
      },
      catch: (error) => {
        if (error instanceof TypeError || error instanceof SupervisorDrainError) return error;
        throw error;
      },
    }),
);

/**
 * Completes the current generation's retired-owner drain without replacing active state.
 * @param options - State-machine completion authority.
 * @returns Original report plus a truthful completed/stale transition witness.
 */
export const drainPreviousGenerationWorkflow = Effect.fn("SupervisorDrain.previousGeneration")(
  function* (options: DrainPreviousGenerationOptions) {
    const service = yield* SupervisorDrainOwner;
    const report = yield* service.drain;
    const completed =
      report.outcome === "drained"
        ? options.stateMachine.drainSucceeded(options.activeToken)
        : options.stateMachine.drainFailed(options.activeToken, report.outcome);
    return Object.freeze({
      ...report,
      stateTransition: completed ? "completed" : "stale",
    }) satisfies SupervisorDrainReport;
  },
);

import { Schema } from "effect";
import { SupervisorDrainError } from "./drain-errors.js";
import { DrainDeadlineSchema } from "./drain.schemas.js";
import { sameToken } from "./proxy-validation.js";
import { validateSupervisorToken } from "./state-machine-telemetry.js";
import type { SupervisorDrainOptions } from "./drain.types.js";

/** Validates synchronous admission. @param options - Requested generation owner.
 * @param fallback - Default shutdown budget. @returns Validated deadline preserving legacy errors.
 */
export function validateDrainOptions(options: SupervisorDrainOptions, fallback: number): number {
  validateSupervisorToken(options.token);
  if (options.candidate !== undefined && !sameToken(options.candidate.token, options.token))
    throw new SupervisorDrainError(
      "RELKIT_DRAIN_TOKEN_MISMATCH",
      "The candidate token does not match the retired generation.",
    );
  const deadline = options.deadlineMs ?? fallback;
  if (!Schema.is(DrainDeadlineSchema)(deadline))
    throw new RangeError("Supervisor drain deadline must be a non-negative safe integer.");
  return deadline;
}

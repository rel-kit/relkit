/** Reads one native compiler exit diagnostic without rendering its stack twice. Unexpected failures, mixed causes, defects and cancellation retain their original failure channel. */
import { Cause, Effect, Exit } from "effect";
import { ScaffoldProcessFailure } from "./scaffold-process.errors.js";

/** Extracts only the original compiler command failure message.
 * @param exit - Observed exit of the native compiler command, including its typed process failure.
 * @returns The unchanged message, an empty successful result, or the complete unexpected cause.
 */
export function packedCompilerDiagnostic(
  exit: Exit.Exit<string, ScaffoldProcessFailure | Cause.TimeoutError>,
) {
  if (Exit.isSuccess(exit)) return Effect.succeed("");
  const reason = exit.cause.reasons[0];
  if (
    exit.cause.reasons.length !== 1 ||
    reason === undefined ||
    !Cause.isFailReason(reason) ||
    !(reason.error instanceof ScaffoldProcessFailure) ||
    reason.error.operation !== "process.exit"
  )
    return Effect.failCause(exit.cause);
  return Effect.succeed(reason.error.message);
}

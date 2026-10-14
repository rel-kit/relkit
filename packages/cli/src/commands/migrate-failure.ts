/** Presents only expected single migration failures; mixed defects/interruption remain terminal causes. */
import { Cause, Effect } from "effect";
import { CliAdapterError, CliFailureError } from "../cli-errors.js";
import { SourceLocationError } from "@relkit/contracts";
import { AuthoredSourceInspectionError, SourceResolutionError } from "@relkit/compiler";
import type { CliCommandContext } from "../main-support.js";

/**
 * Emits a complete secret-free failure object for known operational/usage failures.
 * @typeParam Failure - Domain failures from parsing/acquisition/execution.
 * @param cause - Full cause; only one recognized failure is recoverable here.
 * @param context - Existing JSON/human presentation policy.
 * @returns Reported exit status, or the unchanged unrecognized/mixed cause.
 */
export function reportMigrationFailure<Failure>(
  cause: Cause.Cause<Failure>,
  context: CliCommandContext,
) {
  const reason = cause.reasons[0];
  if (cause.reasons.length !== 1 || reason?._tag !== "Fail") return Effect.failCause(cause);
  const error = reason.error;
  if (!(
    error instanceof CliFailureError ||
    error instanceof CliAdapterError ||
    error instanceof SourceLocationError ||
    error instanceof SourceResolutionError ||
    error instanceof AuthoredSourceInspectionError
  ))
    return Effect.failCause(cause);
  const expected =
    error instanceof CliAdapterError && error.cause instanceof CliFailureError
      ? error.cause
      : error;
  const code = expected instanceof CliFailureError ? expected.code : "RELKIT_LAYOUT_FAILED";
  const exitCode = expected instanceof CliFailureError ? expected.exitCode : 1;
  const message =
    expected instanceof CliFailureError
      ? expected.message
      : "Migration could not verify its local inputs; no successful publication was reported.";
  return Effect.sync(() => {
    context.reporter.output(
      {
        ok: false,
        status: "refused",
        layout: null,
        moves: [],
        edits: [],
        warnings: [],
        conflicts: [{ message }],
        verification: "not-run",
        nextSteps: [],
        error: { code, message },
      },
      `${code}: ${message}`,
    );
    return exitCode;
  });
}

import { basename, join } from "node:path";
import { CliFailureError } from "../cli-errors.js";

/**
 * Preserves actionable DuckDB ownership guidance and existing public failure codes.
 * @param root - Explicit local telemetry storage root.
 * @param cause - Original native open failure.
 * @returns Existing lock/unavailable error without exposing raw lock-provider noise.
 */
export function telemetryOpenFailure(root: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const owner = /Conflicting lock is held in (.+?) \(PID (\d+)\)/.exec(detail);
  const database = join(root, "observability.duckdb");
  if (owner !== null || /Could not set lock/.test(detail))
    return failure(
      "RELKIT_DEV_TELEMETRY_LOCKED",
      [
        "Local telemetry is already in use by another dev session.",
        "",
        `  Database  ${database}`,
        ...(owner === null ? [] : [`  Owner     PID ${owner[2]} (${basename(owner[1]!)})`]),
        "",
        "Stop that session with Ctrl-C, then run `bun dev` again.",
      ].join("\n"),
    );
  return failure(
    "RELKIT_DEV_TELEMETRY_UNAVAILABLE",
    [`Cannot open the local telemetry database at ${database}.`, `Cause: ${detail}`].join("\n"),
  );
}

/** Constructs the fixed telemetry product failure without importing the full CLI dispatch graph. */
function failure(code: string, message: string): CliFailureError {
  return new CliFailureError({ code, message, exitCode: 1 });
}

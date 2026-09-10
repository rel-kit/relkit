import { basename, join } from "node:path";
import { fail } from "../main-support.js";

export function telemetryOpenFailure(root: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const owner = /Conflicting lock is held in (.+?) \(PID (\d+)\)/.exec(detail);
  const database = join(root, "observability.duckdb");
  if (owner !== null || /Could not set lock/.test(detail))
    return fail(
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
  return fail(
    "RELKIT_DEV_TELEMETRY_UNAVAILABLE",
    [`Cannot open the local telemetry database at ${database}.`, `Cause: ${detail}`].join("\n"),
  );
}

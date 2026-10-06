import { canonicalJson } from "@relkit/contracts";
import type { CleanupIssue } from "./services/cleanup.types.js";
import type { CliCleanupPresentation } from "./cli-runtime.types.js";
import type { LogRecord } from "@relkit/runtime-effect";

/**
 * Reports bounded cleanup evidence at an explicitly selected terminal boundary.
 * @param evidence - Settled cleanup ledger, including runtime disposal.
 * @param presentation - Existing terminal policy, absent for library-only edges.
 * @returns No value; sink failure cannot replace the primary outcome.
 * @remarks Only declaration labels and cause kinds are emitted. Native messages,
 * paths, secrets and stack traces remain in object-owned inspection receipts.
 */
export function presentCliCleanup(
  evidence: readonly CleanupIssue[],
  presentation?: CliCleanupPresentation,
): void {
  if (!presentation || !evidence.length) return;
  const bounded = evidence.length <= 128 ? evidence : [evidence[0]!, ...evidence.slice(-127)];
  const issues = bounded.map((issue) => ({
    operation: /^[a-z][a-z0-9.-]{0,127}$/i.test(issue.operation)
      ? issue.operation
      : "cleanup.release",
    causes: [...new Set(issue.cause.reasons.map((reason) => reason._tag))],
  }));
  const record: LogRecord = {
    version: 2,
    signal: "log",
    component: "cli",
    timestamp: new Date().toISOString(),
    message: "CLI cleanup failed",
    level: "warn",
    fields: { code: "RELKIT_CLI_CLEANUP_FAILED", count: evidence.length, issues },
  };
  try {
    presentation.io.stderr(
      presentation.json
        ? canonicalJson(record)
        : `Cleanup failed after command completion: ${issues.map((issue) => issue.operation).join(", ")}`,
    );
  } catch {
    // Terminal sink ownership is foreign to the completed command outcome.
  }
}

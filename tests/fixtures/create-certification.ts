/** Builds synthetic exact-identity reports for validator and rollback regressions; these are never retained as release evidence. */
import { CREATE_CAPABILITY_TABLE } from "../../packages/create-relkit/src/create-capabilities.ts";

export const entry = {
  ...CREATE_CAPABILITY_TABLE.entries[0]!,
  identity: { ...CREATE_CAPABILITY_TABLE.entries[0]!.identity, release: "9.9.9" },
  freshEvidence: "docs/evidence/create-capabilities/9.9.9/fresh.json",
  restartEvidence: "docs/evidence/create-capabilities/9.9.9/restart.json",
};

/**
 * Constructs synthetic passing inputs for strict and functional policy regressions.
 * @param set - Cohort the validator must require.
 * @param readinessOnly - Selects the explicit version-2 functional report format.
 * @returns Mutable synthetic report for identity, sample, and rollback fault injection.
 */
export function report(set: "fresh" | "restart", readinessOnly = false) {
  return {
    protocol: "relkit.dev-readiness",
    version: readinessOnly ? 2 : 1,
    mode: readinessOnly ? "candidate-readiness" : "candidate-certification",
    set,
    command: "bun dev",
    thresholdMs: 1_000,
    expectedRuns: 20,
    ...(readinessOnly
      ? { readiness: { deadlineMs: 30_000, runs: 20, passed: true, preparationPassed: true } }
      : {}),
    fixture: { version: entry.identity.release, examples: "examples" },
    identity: {
      bun: { version: entry.identity.bun },
      cli: { version: entry.identity.release },
      typescript: { version: entry.identity.typescript },
      inspectorOverride: "absent",
      artifacts: ["create-relkit", "@relkit/cli"].map((name) => ({
        name,
        hash: `sha256:${"a".repeat(64)}`,
      })),
    },
    summary: { runs: 20, passed: true, preparationPassed: true },
    attempts: Array.from({ length: 20 }, (_, index) => ({
      run: index + 1,
      sample: {
        outcome: "response",
        durationMs: 100,
        cleanupFailure: undefined as string | undefined,
        exitCode: undefined as number | undefined,
      },
    })),
    preparationAttempt: { sample: { outcome: "response", durationMs: 100 } },
  };
}

import { expect, test } from "bun:test";
import { verifyMutationReport } from "../../scripts/jobs-coverage/verify-mutation.js";
import type { MutationReport } from "../../scripts/jobs-coverage/verify-mutation.types.js";

/**
 * Supplies independent source positions for all six retained semantic requirements.
 * @returns A complete successful report with one killed mutant per responsibility.
 */
function successfulReport(): MutationReport {
  return {
    files: {
      "packages/jobs/src/authorization-grant.ts": {
        mutants: [{ status: "Killed", location: { start: { line: 26 } } }],
      },
      "packages/client/src/jobs/controller.service.ts": {
        mutants: [
          { status: "Killed", location: { start: { line: 100 } } },
          { status: "Killed", location: { start: { line: 112 } } },
        ],
      },
      "packages/jobs/src/task-policy-value.ts": {
        mutants: [
          { status: "Killed", location: { start: { line: 74 } } },
          { status: "Killed", location: { start: { line: 113 } } },
        ],
      },
      "packages/jobs/src/duration.ts": {
        mutants: [{ status: "Killed", location: { start: { line: 60 } } }],
      },
    },
  };
}

test("requires killed mutants in all retained semantic responsibilities", () => {
  expect(verifyMutationReport(successfulReport())).toHaveLength(7);
  for (const [file, entry] of Object.entries(successfulReport().files)) {
    for (let index = 0; index < entry.mutants.length; index++) {
      const report = successfulReport();
      report.files[file] = {
        mutants: entry.mutants.map((mutant, current) =>
          current === index ? { ...mutant, status: "NoCoverage" } : mutant,
        ),
      };
      expect(() => verifyMutationReport(report)).toThrow("Mutation checks did not kill");
    }
  }
});

test("old facade line numbers cannot satisfy migrated stale-epoch ownership", () => {
  const report = successfulReport();
  report.files["packages/client/src/jobs/controller.service.ts"] = {
    mutants: [{ status: "Killed", location: { start: { line: 100 } } }],
  };
  report.files["packages/client/src/jobs/controller.ts"] = {
    mutants: [{ status: "Killed", location: { start: { line: 130 } } }],
  };
  expect(() => verifyMutationReport(report)).toThrow("stale epochs");
});

test("mutation execution errors fail even when every semantic requirement has a kill", () => {
  const report = successfulReport();
  report.files["unrelated.ts"] = { mutants: [{ status: "Error" }] };
  expect(() => verifyMutationReport(report)).toThrow("Mutation run produced 1 errors.");
});

/** Registers original public-dependency allow/deny assertions using scope-owned native fixtures and unchanged scanner diagnostics. */
import { describe, expect, test } from "bun:test";
import { execute, boundaryScript, withFixture } from "./phase0-harness.js";
import { allowedPackages } from "./phase0-allowed-packages.js";
import { boundaryCases } from "./phase0-boundary-cases.js";
import type { BoundaryCase, Files } from "./phase0-harness.types.js";

/** Runs an original forbidden fixture and preserves every path, rule and owner assertion.
 * @param files - Exact synthetic manifest/source inputs.
 * @param expected - Original scanner diagnostic contract.
 * @returns Completion after the native child and fixture release. */
function assertBoundaryViolation(files: Files, expected: BoundaryCase["expected"]): Promise<void> {
  return withFixture(files, async (fixture) => {
    const result = await execute(process.execPath, ["run", boundaryScript, fixture]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(expected.path);
    expect(result.stderr).toContain("[" + expected.rule + "]");
    expect(result.stderr).toContain(expected.owner);
  });
}

describe.serial("Phase 0 guardrails", () => {
  test("allows a declared public-package dependency", async () => {
    return withFixture(allowedPackages[0], async (fixture) => {
      const result = await execute(process.execPath, ["run", boundaryScript, fixture]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Boundary check passed");
    });
  });
  test("allows integration, catalog, and application dependency direction", async () => {
    return withFixture(allowedPackages[1], async (fixture) => {
      const result = await execute(process.execPath, ["run", boundaryScript, fixture]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Boundary check passed");
    });
  });
  for (const boundaryCase of boundaryCases) {
    test("rejects " + boundaryCase.name, () =>
      assertBoundaryViolation(boundaryCase.files, boundaryCase.expected),
    );
  }
});

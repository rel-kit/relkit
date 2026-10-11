import { expect, test } from "vitest";
import { candidateSummary } from "../dev-readiness/benchmark-packed-summary.js";

function attempt(run: number, durationMs: number) {
  return {
    run,
    projectRoot: `/fixture/${run}`,
    sample: {
      durationMs,
      outcome: "response" as const,
      exitCode: undefined,
      output: "ready",
    },
  };
}

test("restart preparation is retained in the sub-second acceptance gate", () => {
  const measured = [attempt(1, 100), attempt(2, 120)];
  expect(candidateSummary(measured, attempt(0, 999))).toMatchObject({
    runs: 2,
    preparationPassed: true,
    passed: true,
  });
  expect(candidateSummary(measured, attempt(0, 1_000))).toMatchObject({
    runs: 2,
    preparationPassed: false,
    passed: false,
  });
});

test("every measured start must be strictly below one second", () => {
  expect(candidateSummary([attempt(1, 999.9)]).passed).toBe(true);
  expect(candidateSummary([attempt(1, 100), attempt(2, 1_000)]).passed).toBe(false);
});

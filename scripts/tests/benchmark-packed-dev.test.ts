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

test("restart preparation is retained in the sub-500ms acceptance gate", () => {
  const measured = [attempt(1, 100), attempt(2, 120)];
  expect(candidateSummary(measured, attempt(0, 499))).toMatchObject({
    runs: 2,
    preparationPassed: true,
    passed: true,
  });
  expect(candidateSummary(measured, attempt(0, 500))).toMatchObject({
    runs: 2,
    preparationPassed: false,
    passed: false,
  });
});

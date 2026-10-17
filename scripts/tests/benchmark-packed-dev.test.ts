import { expect, test } from "vitest";
import { candidateReadiness, candidateSummary } from "../dev-readiness/benchmark-packed-summary.js";

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

test("functional admission preserves slow timing failures and requires every completed start", () => {
  const measured = [attempt(1, 1_609), attempt(2, 1_000)];
  expect(candidateReadiness(measured, attempt(0, 1_465), 2).passed).toBe(true);
  expect(candidateSummary(measured, attempt(0, 1_465)).passed).toBe(false);
  expect(candidateReadiness(measured, attempt(0, 30_000), 2).passed).toBe(false);
  expect(candidateReadiness(measured, undefined, 3).passed).toBe(false);
  expect(candidateReadiness([]).passed).toBe(false);
  expect(
    candidateReadiness([{ run: 1, projectRoot: "/fixture", failure: "defect", message: "failed" }])
      .passed,
  ).toBe(false);
  for (const duration of [30_000, -1, NaN, Infinity])
    expect(candidateReadiness([attempt(1, duration)]).passed).toBe(false);
  for (const sample of [
    { ...attempt(1, 100).sample, exitCode: 0 },
    { ...attempt(1, 100).sample, outcome: "timeout" as const },
    { ...attempt(1, 100).sample, cleanupFailure: { reasons: ["Die" as const] } },
  ])
    expect(candidateReadiness([{ ...attempt(1, 100), sample }]).passed).toBe(false);
});

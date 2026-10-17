/** Exercises functional admission independently of strict timing and corrupt report flags, retaining every failure case. */
import { expect, test } from "bun:test";
import { validateCreationReport } from "../../scripts/release-create-evidence.ts";
import { entry, report } from "../fixtures/create-certification.ts";

test("shared-host slow starts pass only functional readiness and remain performance failures", () => {
  for (const set of ["fresh", "restart"] as const) {
    const value = report(set, true);
    // Slow samples from https://github.com/rel-kit/relkit/actions/runs/38976443609.
    // This synthetic validator fixture is not release evidence.
    for (const [index, duration] of [1_254.823, 1_609.263, 1_046.087, 1_465.238].entries())
      value.attempts[index]!.sample.durationMs = duration;
    value.summary.passed = false;
    expect(() => validateCreationReport(value, entry, set)).not.toThrow();
    value.summary.passed = true;
    expect(() => validateCreationReport(value, entry, set)).toThrow("Performance verdict");
    value.summary.passed = false;
    value.version = 1;
    value.mode = "candidate-certification";
    expect(() => validateCreationReport(value, entry, set)).toThrow();
  }
  const restart = report("restart", true);
  restart.preparationAttempt.sample.durationMs = 1_000;
  restart.summary.preparationPassed = false;
  restart.summary.passed = false;
  expect(() => validateCreationReport(restart, entry, "restart")).not.toThrow();
  restart.preparationAttempt.sample.durationMs = 30_000;
  expect(() => validateCreationReport(restart, entry, "restart")).toThrow();
});

test("functional readiness independently rejects failed, malformed, partial or stale evidence", () => {
  for (const mutate of [
    (value: ReturnType<typeof report>) => {
      value.attempts[0]!.sample.durationMs = 30_000;
    },
    (value: ReturnType<typeof report>) => {
      value.attempts[0]!.sample.durationMs = NaN;
    },
    (value: ReturnType<typeof report>) => {
      value.attempts[0]!.sample.durationMs = Infinity;
    },
    (value: ReturnType<typeof report>) => {
      value.attempts[0]!.sample.durationMs = -1;
    },
    (value: ReturnType<typeof report>) => {
      value.attempts[0]!.sample.outcome = "timeout";
    },
    (value: ReturnType<typeof report>) => {
      value.attempts[0]!.sample.cleanupFailure = "leaked";
    },
    (value: ReturnType<typeof report>) => {
      value.attempts[0]!.sample.exitCode = 0;
    },
    (value: ReturnType<typeof report>) => {
      value.attempts.pop();
    },
    (value: ReturnType<typeof report>) => {
      value.attempts[0]!.run = 2;
    },
    (value: ReturnType<typeof report>) => {
      value.identity.cli.version = "stale";
    },
    (value: ReturnType<typeof report>) => {
      value.mode = "candidate-diagnostic";
    },
    (value: ReturnType<typeof report>) => {
      value.version = 3;
    },
    (value: ReturnType<typeof report>) => {
      value.readiness!.deadlineMs = 60_000;
    },
    (value: ReturnType<typeof report>) => {
      value.readiness!.passed = false;
    },
    (value: ReturnType<typeof report>) => {
      value.expectedRuns = 19;
    },
    (value: ReturnType<typeof report>) => {
      Reflect.deleteProperty(value.attempts[0]!, "sample");
    },
    (value: ReturnType<typeof report>) => {
      Reflect.deleteProperty(value, "preparationAttempt");
    },
  ]) {
    const value = report("restart", true);
    mutate(value);
    expect(() => validateCreationReport(value, entry, "restart")).toThrow();
  }
});

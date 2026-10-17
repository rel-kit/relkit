/** Separates strict timing statistics from functional packed-start admission without removing attempts or preparation failures. */
import type { Effect } from "effect";
import { summarizeStarts } from "./benchmark.service.js";
import type { benchmarkReportEffect } from "./benchmark-report.js";
import type { StartSample } from "./benchmark.types.js";

export type PackedAttempt = Effect.Success<ReturnType<typeof benchmarkReportEffect>> & {
  readonly projectRoot: string;
};

/** Summarizes measured restarts while retaining the required preparation launch in the gate. */
export function candidateSummary(
  attempts: readonly PackedAttempt[],
  preparationAttempt?: Effect.Success<ReturnType<typeof benchmarkReportEffect>>,
) {
  const samples = attempts.flatMap((attempt) =>
    attempt.sample === undefined ? [] : [attempt.sample],
  );
  const summary = summarizeStarts(samples, 1_000);
  const preparationPassed =
    preparationAttempt === undefined ||
    (preparationAttempt.sample?.outcome === "response" &&
      preparationAttempt.sample.durationMs < 1_000 &&
      preparationAttempt.sample.cleanupFailure === undefined);
  return {
    ...summary,
    preparationPassed,
    passed: samples.length === attempts.length && summary.passed && preparationPassed,
  };
}

/**
 * Retains the terminal deadline independently of the strict timing result.
 * @param attempts - Every measured packed launch, including absent samples.
 * @param preparationAttempt - Separate initial launch required for restart measurement.
 * @param expectedRuns - Required count, including runs not yet checkpointed.
 * @returns Functional verdict retaining preparation and incomplete-set failures.
 */
export function candidateReadiness(
  attempts: readonly PackedAttempt[],
  preparationAttempt?: Effect.Success<ReturnType<typeof benchmarkReportEffect>>,
  expectedRuns = attempts.length,
) {
  const deadlineMs = 30_000;
  const successful = (sample: StartSample | undefined) =>
    sample?.outcome === "response" &&
    Number.isFinite(sample.durationMs) &&
    sample.durationMs >= 0 &&
    sample.durationMs < deadlineMs &&
    sample.exitCode === undefined &&
    sample.cleanupFailure === undefined;
  const preparationPassed =
    preparationAttempt === undefined || successful(preparationAttempt.sample);
  return {
    deadlineMs,
    runs: attempts.length,
    preparationPassed,
    passed:
      attempts.length > 0 &&
      attempts.length === expectedRuns &&
      attempts.every((attempt) => successful(attempt.sample)) &&
      preparationPassed,
  };
}

import type { Effect } from "effect";
import { summarizeStarts } from "./benchmark.service.js";
import type { benchmarkReportEffect } from "./benchmark-report.js";

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
  const summary = summarizeStarts(samples, 500);
  const preparationPassed =
    preparationAttempt === undefined ||
    (preparationAttempt.sample?.outcome === "response" &&
      preparationAttempt.sample.durationMs < 500 &&
      preparationAttempt.sample.cleanupFailure === undefined);
  return {
    ...summary,
    preparationPassed,
    passed: samples.length === attempts.length && summary.passed && preparationPassed,
  };
}

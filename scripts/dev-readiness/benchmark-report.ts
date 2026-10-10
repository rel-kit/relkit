/**
 * Retains each measured attempt even when acquisition, cleanup or observation
 * fails. This report boundary preserves complete Cause classification and does
 * not turn a defect, interruption or an operational failure into a passing run.
 */
import { Cause, Effect, Exit } from "effect";
import type { ReadinessBenchmarkOperations, StartRequest } from "./benchmark.types.js";

/**
 * Executes one sample and captures its complete outcome as acceptance evidence.
 * @param benchmark - Acquired measured workflow.
 * @param request - Exact command and serving contract.
 * @param run - One-based index retained even when the attempt fails.
 * @returns An attempt with either a measured sample or a safe failure classification.
 */
export const benchmarkReportEffect = Effect.fn("ReadinessBenchmark.record")(function* (
  benchmark: ReadinessBenchmarkOperations,
  request: StartRequest,
  run: number,
) {
  const exit = yield* Effect.exit(benchmark.measure(request));
  if (Exit.isSuccess(exit)) return { run, sample: exit.value };
  const failure = Cause.hasDies(exit.cause)
    ? "defect"
    : Cause.hasInterruptsOnly(exit.cause)
      ? "interrupted"
      : "failure";
  if (failure === "interrupted") return yield* Effect.failCause(exit.cause);
  return {
    run,
    failure,
    message: "Measurement or owned cleanup failed; inspect retained operation diagnostics.",
  };
});

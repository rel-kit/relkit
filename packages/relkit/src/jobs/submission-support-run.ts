import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type { JobsOperation } from "./jobs-observability.types.js";
/** Expected submission helper failure with its original cause.
 * @example if (error instanceof SubmissionSupportFailure) console.log(error.message);
 */
export class SubmissionSupportFailure extends Schema.TaggedError<SubmissionSupportFailure>()(
  "Jobs.SubmissionSupportFailure",
  { cause: Schema.Defect() },
) {}
/** Runs a submission helper inside an observed Effect.
 * @param operation - Telemetry operation name.
 * @param compute - Synchronous helper calculation.
 * @returns An observed Effect with a tagged failure.
 * @example submissionSupportEffect("submission.prepare", () => receipt);
 */
export function submissionSupportEffect<A>(operation: JobsOperation, compute: () => A) {
  return observeJobs(
    operation,
    Effect.try({
      try: compute,
      catch: (cause) => new SubmissionSupportFailure({ cause }),
    }),
  );
}
/** Synchronous submission helper compatibility runner.
 * @param effect - Effect to evaluate.
 * @returns The computed value.
 * @throws The original helper error on failure.
 * @example runSubmissionSupport(submissionSupportEffect("submission.prepare", () => receipt));
 */
export function runSubmissionSupport<A>(effect: Effect.Effect<A, SubmissionSupportFailure>): A {
  const result = Effect.runSync(Effect.result(effect));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}

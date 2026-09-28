import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type { JobsOperation } from "./jobs-observability.types.js";
/** Expected run control helper failure with its original cause.
 * @example if (error instanceof ControlSupportFailure) console.log(error.message);
 */
export class ControlSupportFailure extends Schema.TaggedError<ControlSupportFailure>()(
  "Jobs.ControlSupportFailure",
  { cause: Schema.Defect() },
) {}
/** Runs a control helper inside an observed Effect.
 * @param operation - Telemetry operation name.
 * @param compute - Synchronous control calculation.
 * @returns An observed Effect with a tagged failure.
 * @example controlSupportEffect("controls.read", () => receipt);
 */
export function controlSupportEffect<A>(operation: JobsOperation, compute: () => A) {
  return observeJobs(
    operation,
    Effect.try({
      try: compute,
      catch: (cause) => new ControlSupportFailure({ cause }),
    }),
  );
}
/** Synchronous control helper compatibility runner.
 * @param effect - Effect to evaluate.
 * @returns The computed value.
 * @throws The original helper error on failure.
 * @example runControlSupport(controlSupportEffect("controls.read", () => receipt));
 */
export function runControlSupport<A>(effect: Effect.Effect<A, ControlSupportFailure>): A {
  const result = Effect.runSync(Effect.result(effect));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}

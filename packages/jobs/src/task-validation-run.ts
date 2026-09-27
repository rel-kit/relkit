import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type { JobsOperation } from "./jobs-observability.types.js";
/** Expected task definition validation failure with its original cause.
 * @example if (error instanceof TaskValidationFailure) console.log(error.message);
 */
export class TaskValidationFailure extends Schema.TaggedError<TaskValidationFailure>()(
  "Jobs.TaskValidationFailure",
  { cause: Schema.Defect() },
) {}
/** Runs a task validation calculation in observed Effect.
 * @param operation - Telemetry operation name.
 * @param compute - Synchronous validation calculation.
 * @returns An observed Effect with a tagged failure.
 * @example taskValidationEffect("task.validate", () => descriptor);
 */
export function taskValidationEffect<A>(operation: JobsOperation, compute: () => A) {
  return observeJobs(
    operation,
    Effect.try({
      try: compute,
      catch: (cause) => new TaskValidationFailure({ cause }),
    }),
  );
}
/** Synchronous task validation compatibility runner.
 * @param effect - Effect to evaluate.
 * @returns The validated value.
 * @throws The original validation error on failure.
 * @example runTaskValidation(taskValidationEffect("task.validate", () => descriptor));
 */
export function runTaskValidation<A>(effect: Effect.Effect<A, TaskValidationFailure>): A {
  const result = Effect.runSync(Effect.result(effect));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}

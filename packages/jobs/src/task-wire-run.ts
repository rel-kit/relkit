import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type { JobsOperation } from "./jobs-observability.types.js";
import { TaskWireValidationError } from "./task-wire-support.js";
/** Expected wire operation failure with its original compatibility error.
 * @example if (error instanceof TaskWireFailure) console.log(error.message);
 */
export class TaskWireFailure extends Schema.TaggedError<TaskWireFailure>()("Jobs.TaskWireFailure", {
  code: Schema.String,
  cause: Schema.Defect(),
}) {}
/** Lifts a synchronous wire operation into observed Effect.
 * @param operation - Telemetry operation name.
 * @param compute - Synchronous wire calculation.
 * @returns An observed Effect with a tagged failure.
 * @example wireEffect("wire.encode", () => encoded);
 */
export function wireEffect<A>(operation: JobsOperation, compute: () => A) {
  return observeJobs(
    operation,
    Effect.try({
      try: compute,
      catch: (cause) =>
        new TaskWireFailure({
          code: cause instanceof TaskWireValidationError ? cause.code : "RELKIT_TASK_WIRE_INVALID",
          cause,
        }),
    }),
  );
}
/** Lifts an asynchronous wire operation into observed Effect.
 * @param operation - Telemetry operation name.
 * @param compute - Asynchronous wire calculation.
 * @returns An observed Effect with a tagged failure.
 * @example wirePromiseEffect("wire.decode", async () => decoded);
 */
export function wirePromiseEffect<A>(operation: JobsOperation, compute: () => Promise<A>) {
  return observeJobs(
    operation,
    Effect.tryPromise({
      try: compute,
      catch: (cause) =>
        new TaskWireFailure({
          code: cause instanceof TaskWireValidationError ? cause.code : "RELKIT_TASK_WIRE_INVALID",
          cause,
        }),
    }),
  );
}
/** Runs an Effect wire operation for synchronous compatibility.
 * @param effect - Wire Effect to evaluate.
 * @returns The computed value.
 * @throws The original wire validation error on failure.
 * @example runWireSync(wireEffect("wire.encode", () => encoded));
 */
export function runWireSync<A>(effect: Effect.Effect<A, TaskWireFailure>): A {
  const result = Effect.runSync(Effect.result(effect));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Runs an Effect wire operation for Promise compatibility.
 * @param effect - Wire Effect to evaluate.
 * @returns A Promise of the computed value.
 * @throws The original wire validation error on failure.
 * @example await runWirePromise(wirePromiseEffect("wire.decode", async () => decoded));
 */
export async function runWirePromise<A>(effect: Effect.Effect<A, TaskWireFailure>): Promise<A> {
  const result = await Effect.runPromise(Effect.result(effect));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}

import { isStableId } from "@relkit/contracts";
import { Effect, Result, Schema } from "effect";
import { durationToMillis } from "./duration.js";
import { observeJobs } from "./jobs-observability.js";
import {
  TASK_INPUT_MAX_BYTES,
  TASK_ITEM_MAX_BYTES,
  TASK_OUTPUT_MAX_BYTES,
  memoryBytes,
} from "./task-policy-validation.js";
import type { JobsServiceOptions } from "./service-options.types.js";
/** Invalid authored jobs service options.
 * @example if (error instanceof JobsServiceOptionsError) console.log(error.message);
 */
export class JobsServiceOptionsError extends Schema.TaggedError<JobsServiceOptionsError>()(
  "Jobs.ServiceOptionsError",
  { reason: Schema.String },
) {}
/** Validates jobs service limits, durations, and worker classes in Effect.
 * @param value - Authored service options.
 * @returns Void or JobsServiceOptionsError.
 * @example Effect.runSync(validateJobsServiceOptionsEffect({}));
 */
export const validateJobsServiceOptionsEffect = Effect.fn("Jobs.validateServiceOptions")(
  (value: JobsServiceOptions | undefined) =>
    observeJobs(
      "serviceOptions.validate",
      Effect.try({
        try: () => validateValue(value),
        catch: (error) => {
          if (error instanceof Error) return new JobsServiceOptionsError({ reason: error.message });
          throw error;
        },
      }),
    ),
);
/** Synchronously validates jobs service options.
 * @param value - Authored service options.
 * @returns Void when valid.
 * @throws TypeError when any option is invalid.
 * @example validateJobsServiceOptions({});
 */
export function validateJobsServiceOptions(value: JobsServiceOptions | undefined): void {
  const result = Effect.runSync(Effect.result(validateJobsServiceOptionsEffect(value)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
}
function validateValue(value: JobsServiceOptions | undefined): void {
  if (value === undefined) return;
  if (value.limits !== undefined) {
    assertLimit(value.limits.inputBytes, TASK_INPUT_MAX_BYTES, "limits.inputBytes");
    assertLimit(value.limits.outputBytes, TASK_OUTPUT_MAX_BYTES, "limits.outputBytes");
    assertLimit(value.limits.progressItemBytes, TASK_ITEM_MAX_BYTES, "limits.progressItemBytes");
    assertLimit(value.limits.streamItemBytes, TASK_ITEM_MAX_BYTES, "limits.streamItemBytes");
  }
  for (const [name, duration] of [
    ["maxElapsed", value.maxElapsed],
    ["hookTimeout", value.hookTimeout],
    ["shutdownGrace", value.shutdownGrace],
    ["observation.pollInterval", value.observation?.pollInterval],
    ["observation.readTimeout", value.observation?.readTimeout],
  ] as const) {
    if (duration !== undefined) {
      const milliseconds = durationToMillis(duration);
      if (milliseconds < 1) throw new TypeError(name + " must be positive");
      if (name === "observation.pollInterval" && milliseconds < 2_000)
        throw new TypeError(name + " must be at least 2 seconds");
      if (name === "observation.readTimeout" && milliseconds > 10_000)
        throw new TypeError(name + " must be at most 10 seconds");
    }
  }
  if (value.workers !== undefined) {
    const ids = new Set<string>();
    for (const worker of value.workers.classes) {
      if (!isStableId(worker.id) || ids.has(worker.id))
        throw new TypeError("workers.classes ids must be unique stable ids");
      ids.add(worker.id);
      if (!Number.isFinite(worker.cpu) || worker.cpu <= 0)
        throw new TypeError("workers.classes.cpu must be positive");
      memoryBytes(worker.memory);
      if (worker.nativeClass !== undefined && !isStableId(worker.nativeClass))
        throw new TypeError("workers.classes.nativeClass is invalid");
    }
  }
}
function assertLimit(value: number | undefined, maximum: number, name: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > maximum)) {
    throw new TypeError(name + " must be a positive integer no greater than " + maximum);
  }
}

import type { JobRefAny, TaskRefAny } from "@relkit/contracts/jobs";
import { Effect, Result, Schema } from "effect";
import type { JobsRuntimeBinding, JobsRuntimeOptions } from "./runtime.types.js";
import { observeJobs } from "./jobs-observability.js";
import { resolveBindingValue } from "./runtime-selection-value.js";
/** Invalid manifest or selector resolution for a runtime binding.
 * @example if (error instanceof RuntimeBindingFailure) console.log(error.message);
 */
export class RuntimeBindingFailure extends Schema.TaggedError<RuntimeBindingFailure>()(
  "Jobs.RuntimeBindingFailure",
  { reason: Schema.String },
) {}
/** Resolves a task's runtime binding in Effect.
 * @param task - Task reference.
 * @param selector - Optional explicit job selector.
 * @param options - Runtime manifest and configured jobs.
 * @returns Runtime binding or RuntimeBindingFailure.
 * @example Effect.runSync(resolveBindingEffect(task, undefined, options));
 */
export const resolveBindingEffect = Effect.fn("Jobs.resolveRuntimeBinding")(
  (task: TaskRefAny, selector: JobRefAny | undefined, options: JobsRuntimeOptions) =>
    observeJobs(
      "runtime.resolveBinding",
      Effect.try({
        try: () => resolveBindingValue(task, selector, options),
        catch: (error) => {
          if (error instanceof TypeError)
            return new RuntimeBindingFailure({ reason: error.message });
          throw error;
        },
      }),
    ),
);
/** Synchronous runtime binding resolver.
 * @param task - Task reference.
 * @param selector - Optional explicit job selector.
 * @param options - Runtime manifest and configured jobs.
 * @returns Runtime binding.
 * @throws TypeError for ambiguous or unknown jobs.
 * @example resolveBinding(task, undefined, options);
 */
export function resolveBinding(
  task: TaskRefAny,
  selector: JobRefAny | undefined,
  options: JobsRuntimeOptions,
): JobsRuntimeBinding {
  const result = Effect.runSync(Effect.result(resolveBindingEffect(task, selector, options)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
  return result.success;
}

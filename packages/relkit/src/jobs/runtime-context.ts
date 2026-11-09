import { AsyncLocalStorage } from "node:async_hooks";
import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type { JobsRuntime } from "./runtime.types.js";
const runtimeStorage = new AsyncLocalStorage<JobsRuntime>();
/** Invalid runtime configuration or missing ambient runtime.
 * @example if (error instanceof JobsRuntimeError) console.log(error.message);
 */
export class JobsRuntimeError extends Schema.TaggedError<JobsRuntimeError>()("Jobs.RuntimeError", {
  reason: Schema.String,
}) {}
/** Failure raised by a callback executed inside an ambient runtime.
 * @example if (error instanceof JobsRuntimeCallbackError) console.log(error.message);
 */
export class JobsRuntimeCallbackError extends Schema.TaggedError<JobsRuntimeCallbackError>()(
  "Jobs.RuntimeCallbackError",
  { cause: Schema.Unknown },
) {}
/** Reads the ambient runtime in Effect.
 * @returns The bound runtime, if any; no expected failure.
 * @example Effect.runSync(currentJobsRuntimeEffect());
 */
export const currentJobsRuntimeEffect = Effect.fn("Jobs.currentRuntime")(() =>
  observeJobs(
    "runtime.current",
    Effect.sync(() => runtimeStorage.getStore()),
  ),
);
/** Reads the ambient runtime synchronously.
 * @returns The bound runtime, if any.
 * @example currentJobsRuntime();
 */
export function currentJobsRuntime(): JobsRuntime | undefined {
  return Effect.runSync(currentJobsRuntimeEffect());
}
/** Requires an ambient runtime in Effect.
 * @returns The runtime or JobsRuntimeError when unbound.
 * @example Effect.runSync(requireJobsRuntimeEffect());
 */
export const requireJobsRuntimeEffect = Effect.fn("Jobs.requireRuntime")(
  function* () {
    const runtime = yield* currentJobsRuntimeEffect();
    if (runtime === undefined)
      return yield* new JobsRuntimeError({ reason: "RELKIT_JOBS_RUNTIME_UNBOUND" });
    return runtime;
  },
  (effect) => observeJobs("runtime.require", effect),
);
/** Requires an ambient runtime synchronously.
 * @returns The bound runtime.
 * @throws Error when no runtime is bound.
 * @example requireJobsRuntime();
 */
export function requireJobsRuntime(): JobsRuntime {
  const result = Effect.runSync(Effect.result(requireJobsRuntimeEffect()));
  if (Result.isFailure(result)) throw new Error(result.failure.reason);
  return result.success;
}
/** Runs a callback with the given ambient runtime in Effect.
 * @param runtime - Runtime to bind to the async context.
 * @param callback - Work to invoke under that binding.
 * @returns The callback result or JobsRuntimeCallbackError.
 * @example Effect.runSync(runInJobsRuntimeEffect(runtime, () => requireJobsRuntime()));
 */
export const runInJobsRuntimeEffect = Effect.fn("Jobs.runInRuntime")(
  <A>(runtime: JobsRuntime, callback: () => A) =>
    observeJobs(
      "runtime.runIn",
      Effect.try({
        try: () => runtimeStorage.run(runtime, callback),
        catch: (cause) => new JobsRuntimeCallbackError({ cause }),
      }),
    ),
);
/** Runs a callback with a runtime bound to its async context.
 * @param runtime - Runtime to bind.
 * @param callback - Work to invoke.
 * @returns The callback result.
 * @throws The original callback error, if it throws.
 * @example runInJobsRuntime(runtime, () => requireJobsRuntime());
 */
export function runInJobsRuntime<A>(runtime: JobsRuntime, callback: () => A): A {
  const result = Effect.runSync(Effect.result(runInJobsRuntimeEffect(runtime, callback)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Alias of runInJobsRuntimeEffect.
 * @param runtime - Runtime to bind.
 * @param callback - Work to invoke.
 * @returns The callback result or JobsRuntimeCallbackError.
 * @example Effect.runSync(runWithJobsRuntimeEffect(runtime, () => 1));
 */
export const runWithJobsRuntimeEffect = runInJobsRuntimeEffect;
/** Alias of runInJobsRuntime.
 * @param runtime - Runtime to bind.
 * @param callback - Work to invoke.
 * @returns The callback result.
 * @throws The original callback error.
 * @example runWithJobsRuntime(runtime, () => 1);
 */
export function runWithJobsRuntime<A>(runtime: JobsRuntime, callback: () => A): A {
  return runInJobsRuntime(runtime, callback);
}

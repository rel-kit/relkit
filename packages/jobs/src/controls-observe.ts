import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import type { NativeWatchRequest } from "./adapter.js";
import { Effect, Result } from "effect";
import { observeRunValue } from "./controls-operations.js";
import { JobControlFailure } from "./controls.js";
import { observeJobs } from "./jobs-observability.js";
import type { JobsRuntime } from "./runtime.js";
import type { JobObserveOptions } from "./control-support.js";
/** Acquires an async run observation iterator in Effect.
 * The caller owns iterator consumption and should close it on early exit.
 * @param runtime - Jobs runtime.
 * @param request - Native watch request.
 * @param options - Signal and timeout options.
 * @returns An async iterable or JobControlFailure.
 * @example Effect.runSync(observeRunEffect(runtime, request));
 */
export const observeRunEffect = Effect.fn("Jobs.observeRun")(
  (runtime: JobsRuntime, request: NativeWatchRequest, options: JobObserveOptions = {}) =>
    observeJobs(
      "control.observe",
      Effect.try({
        try: () => observeRunValue(runtime, request, options),
        catch: (cause) => new JobControlFailure({ cause }),
      }),
    ),
);
/** Synchronous compatibility adapter for run observation.
 * @param runtime - Jobs runtime.
 * @param request - Native watch request.
 * @param options - Signal and timeout options.
 * @returns An async iterable owned by the caller.
 * @throws The original capability or provider error during setup.
 * @example for await (const frame of observeRun(runtime, request)) console.log(frame);
 */
export function observeRun(
  runtime: JobsRuntime,
  request: NativeWatchRequest,
  options: JobObserveOptions = {},
): AsyncIterable<RunWatchFrame<RunSnapshot>> {
  const result = Effect.runSync(Effect.result(observeRunEffect(runtime, request, options)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}

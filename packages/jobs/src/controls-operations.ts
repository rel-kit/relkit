import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import type { NativeWatchRequest } from "./adapter.js";
import type { JobsRuntime } from "./runtime.js";
import {
  observeWithTimeout,
  observerTimeout,
  operationContext,
  requireMethod,
  type JobObserveOptions,
} from "./control-support.js";
export { getRunValue, listRunsValue } from "./controls-read.js";
export { cancelRunValue, retryRunValue } from "./controls-write-operations.js";
/** Builds a native run observation with a scoped iterator timeout.
 * The consumer owns the iterator and must close it on early exit.
 * @param runtime - Jobs runtime and native observer.
 * @param request - Run locator and observation position.
 * @param options - Caller signal and per-read timeout.
 * @returns An async iterable of native run frames.
 * @throws The original capability or observer setup error.
 * @example for await (const frame of observeRunValue(runtime, request)) console.log(frame);
 */
export function observeRunValue(
  runtime: JobsRuntime,
  request: NativeWatchRequest,
  options: JobObserveOptions = {},
): AsyncIterable<RunWatchFrame<RunSnapshot>> {
  requireMethod(runtime, "observation", "observe");
  const signal = options.signal ?? new AbortController().signal;
  return observeWithTimeout(
    runtime.adapter.observe(request, operationContext(runtime, signal)),
    signal,
    observerTimeout(runtime, options.timeout),
  );
}

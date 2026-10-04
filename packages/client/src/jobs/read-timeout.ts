import { JobWatchAbortedError, JobWatchReadTimeoutError } from "./types.js";

/**
 * Bounds one native iterator pull using the caller's cancellation authority.
 * @param iterator - Owned native iterator.
 * @param signal - Borrowed caller cancellation signal.
 * @param timeoutMs - Existing read or establishment deadline in milliseconds.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
export async function readWatchNext(
  iterator: AsyncIterator<unknown>,
  signal: AbortSignal,
  timeoutMs = 10_000,
): Promise<IteratorResult<unknown>> {
  return timedCall(signal, timeoutMs, () => iterator.next());
}

/**
 * Races one native boundary call against cancellation and the existing bounded read deadline.
 * @typeParam T - Input and successful result type.
 * @param signal - Borrowed caller cancellation signal.
 * @param timeoutMs - Existing read or establishment deadline in milliseconds.
 * @param operation - One native boundary operation.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
export async function timedCall<T>(
  signal: AbortSignal,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T> | T,
): Promise<T> {
  const controller = new AbortController();
  const requestedTimeout = Number.isFinite(timeoutMs) ? timeoutMs : 10_000;
  const boundedTimeout = Math.min(10_000, Math.max(1, requestedTimeout));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const cancellation = new Promise<never>((_, reject) => {
    if (signal.aborted) reject(new JobWatchAbortedError());
    else {
      onAbort = () => reject(new JobWatchAbortedError());
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new JobWatchReadTimeoutError());
    }, boundedTimeout);
  });
  try {
    return await Promise.race([
      Promise.resolve(operation(controller.signal)),
      cancellation,
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort !== undefined) signal.removeEventListener("abort", onAbort);
    controller.abort();
  }
}

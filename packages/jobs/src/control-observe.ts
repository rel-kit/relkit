import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import { JobObservationTimeoutError } from "./control-errors.js";

export async function* observeWithTimeout(
  source: AsyncIterable<RunWatchFrame<RunSnapshot>>,
  signal: AbortSignal,
  timeoutMs: number,
): AsyncIterable<RunWatchFrame<RunSnapshot>> {
  const iterator = source[Symbol.asyncIterator]();
  try {
    while (true) {
      const next = await nextWithTimeout(iterator.next(), signal, timeoutMs);
      if (next.done) return;
      yield next.value;
    }
  } finally {
    try {
      await iterator.return?.();
    } catch {
      // Observer cleanup must not replace the original timeout or disconnect error.
    }
  }
}

function nextWithTimeout<T>(
  next: Promise<IteratorResult<T>> | IteratorResult<T>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<IteratorResult<T>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      settle();
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = (): void =>
      finish(() => reject(signal.reason ?? new Error("Observation aborted")));
    const timer = setTimeout(
      () => finish(() => reject(new JobObservationTimeoutError(timeoutMs))),
      timeoutMs,
    );
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(next).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

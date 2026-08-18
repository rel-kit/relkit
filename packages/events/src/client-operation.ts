import { EventOperationCancelledError, EventOperationTimeoutError } from "./client-utils.js";

export function runAbortable<A>(
  signal: AbortSignal,
  deadlineMs: number | undefined,
  work: () => Promise<A>,
): Promise<A> {
  if (signal.aborted) return Promise.reject(new EventOperationCancelledError());
  if (deadlineMs !== undefined && deadlineMs <= Date.now())
    return Promise.reject(new EventOperationTimeoutError());
  const pending = Promise.resolve().then(work);
  return new Promise<A>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const abort = (): void => {
      cleanup();
      reject(new EventOperationCancelledError());
    };
    if (deadlineMs !== undefined)
      timer = setTimeout(
        () => {
          cleanup();
          reject(new EventOperationTimeoutError());
        },
        Math.max(0, deadlineMs - Date.now()),
      );
    signal.addEventListener("abort", abort, { once: true });
    pending.then(
      (result) => {
        cleanup();
        resolve(result);
      },
      (cause) => {
        cleanup();
        reject(cause);
      },
    );
  });
}

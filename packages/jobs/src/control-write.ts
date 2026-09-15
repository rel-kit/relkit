import { JobControlUnknownError } from "./control-errors.js";

export function controlWrite<A>(
  call: () => Promise<A>,
  signal: AbortSignal | undefined,
  operationId: string,
): Promise<A> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Job control was cancelled before acceptance"));
  const pending = Promise.resolve().then(call);
  if (signal === undefined) return pending;
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new JobControlUnknownError(operationId));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

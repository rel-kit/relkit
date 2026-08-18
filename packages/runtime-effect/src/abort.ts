export interface AbortBridge {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
}

/** Links a public signal to the fiber signal without retaining listeners. */
export function createAbortBridge(
  fiberSignal: AbortSignal,
  parentSignal?: AbortSignal,
): AbortBridge {
  const controller = new AbortController();
  let disposed = false;

  const abortFrom = (source: AbortSignal): void => {
    if (!controller.signal.aborted) controller.abort(source.reason);
  };
  const onFiberAbort = (): void => abortFrom(fiberSignal);
  const onParentAbort = (): void => {
    if (parentSignal !== undefined) abortFrom(parentSignal);
  };

  const preAborted =
    parentSignal?.aborted === true ? parentSignal : fiberSignal.aborted ? fiberSignal : undefined;
  if (preAborted !== undefined) {
    controller.abort(preAborted.reason);
  } else {
    fiberSignal.addEventListener("abort", onFiberAbort, { once: true });
    if (parentSignal !== undefined && parentSignal !== fiberSignal) {
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      fiberSignal.removeEventListener("abort", onFiberAbort);
      if (parentSignal !== undefined && parentSignal !== fiberSignal) {
        parentSignal.removeEventListener("abort", onParentAbort);
      }
    },
  };
}

/** Passes a signal to a Promise operation and rejects promptly on abort. */
export function abortablePromise<A>(
  signal: AbortSignal,
  operation: (signal: AbortSignal) => PromiseLike<A>,
): Promise<A> {
  if (signal.aborted) return Promise.reject(abortReason(signal));

  return new Promise<A>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    function onAbort(): void {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortReason(signal));
    }

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }

    void Promise.resolve()
      .then(() => {
        if (settled) return;
        return operation(signal);
      })
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value as A);
        },
        (cause) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(cause);
        },
      );
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Operation aborted");
}

/**
 * Pulls a native async iterator that one request owns, and releases the request on every exit.
 * @typeParam A - Item type.
 * @param open - Opens the iterator; it must pass the given signal to its request.
 * @param options - Caller cancellation, a callback once the iterator is open, and a custom read.
 * @returns An async generator; breaking out of it, an error, or the caller's abort aborts the
 * request and then returns the native iterator.
 * @example for await (const item of iterateNative((signal) => client.stream(input, { signal }))) use(item);
 */
export async function* iterateNative<A>(
  open: (signal: AbortSignal) => PromiseLike<AsyncIterator<A> | AsyncIterable<A>>,
  options: {
    readonly signal?: AbortSignal;
    readonly opened?: () => void;
    readonly read?: (
      iterator: AsyncIterator<A>,
      signal: AbortSignal,
    ) => PromiseLike<IteratorResult<A>>;
  } = {},
): AsyncGenerator<A, void, undefined> {
  const controller = new AbortController();
  const signal =
    options.signal === undefined
      ? controller.signal
      : AbortSignal.any([options.signal, controller.signal]);
  signal.throwIfAborted();
  let iterator: AsyncIterator<A> | undefined;
  try {
    const opened = await open(signal);
    iterator =
      Symbol.asyncIterator in opened
        ? (opened as AsyncIterable<A>)[Symbol.asyncIterator]()
        : (opened as AsyncIterator<A>);
    signal.throwIfAborted();
    options.opened?.();
    const read = options.read ?? ((source: AsyncIterator<A>) => source.next());
    while (true) {
      const next = await read(iterator, signal);
      if (next.done) return;
      yield next.value;
    }
  } finally {
    // Abort first: returning the iterator alone cannot release a pending native pull.
    controller.abort();
    if (iterator !== undefined) await Promise.resolve(iterator.return?.()).catch(() => undefined);
  }
}

/**
 * Settles with the first of a promise or an abort.
 * @typeParam A - Result type.
 * @param promise - Work to wait for.
 * @param signal - Abort that rejects the wait with the signal's reason.
 * @returns The promise's result, or a rejection with the abort reason.
 * @example await abortable(fetchSomething(), signal);
 */
export function abortable<A>(promise: PromiseLike<A>, signal: AbortSignal | undefined): Promise<A> {
  if (signal === undefined) return Promise.resolve(promise);
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<A>((resolve, reject) => {
    const abort = (): void => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/**
 * Waits for a delay unless aborted.
 * @param ms - Delay in milliseconds.
 * @param signal - Abort that rejects the wait.
 * @returns A promise that resolves after the delay.
 * @example await delay(250, signal);
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return abortable(
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => clearTimeout(timer), { once: true });
    }),
    signal,
  );
}

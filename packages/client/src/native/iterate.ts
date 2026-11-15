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
      // Race the pull: a transport may miss the abort while a read is already pending.
      const next = await abortable(read(iterator, signal), signal);
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
 * Ties an async iterator to a signal: an abort settles a pending `next()` with the signal's
 * reason and returns the source, so iteration ends even when the source misses the abort.
 * @typeParam A - Item type.
 * @param source - Iterator one request owns, such as a channel's event stream.
 * @param signal - Abort that ends the iteration and releases the source.
 * @returns An iterator over the same items; the source is returned at most once.
 * @example for await (const frame of abortableIterator(stream, signal)) use(frame);
 */
export function abortableIterator<A>(
  source: AsyncIterator<A>,
  signal: AbortSignal,
): AsyncIterableIterator<A> {
  let released: Promise<unknown> | undefined;
  const release = (): Promise<unknown> =>
    (released ??= Promise.resolve()
      .then(() => source.return?.())
      .catch(() => undefined));
  const onAbort = (): void => void release();
  const detach = (): void => signal.removeEventListener("abort", onAbort);
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  const wrapped: AsyncIterableIterator<A> = {
    next: async (...args: [] | [unknown]) => {
      try {
        const result = await abortable(source.next(...args), signal);
        if (result.done === true) detach();
        return result;
      } catch (error) {
        detach();
        throw error;
      }
    },
    return: async (value?: unknown) => {
      detach();
      await release();
      return { done: true, value: value as A };
    },
    throw: async (error?: unknown) => {
      detach();
      if (source.throw === undefined) {
        await release();
        throw error;
      }
      // The source's own throw releases it and keeps the caller's error identity.
      released ??= Promise.resolve();
      return source.throw(error);
    },
    [Symbol.asyncIterator]: () => wrapped,
  };
  return wrapped;
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

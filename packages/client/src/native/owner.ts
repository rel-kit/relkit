/**
 * Owns a set of running operations so that closing the owner aborts them and waits for them.
 * @example
 * ```ts
 * const owner = createWorkOwner();
 * const result = owner.run((signal) => fetch(url, { signal }));
 * await owner.close(); // aborts the fetch and waits for it to settle
 * ```
 */
export interface WorkOwner {
  /** Whether {@link WorkOwner.close} has been called. */
  readonly closed: boolean;
  /**
   * Runs one operation with a signal the owner aborts on close.
   * @param work - The operation; it must stop when its signal aborts.
   * @param signal - Optional caller abort, combined with the owner's.
   * @returns The operation's result; rejects with an AbortError when the owner is closed.
   */
  run<A>(work: (signal: AbortSignal) => PromiseLike<A>, signal?: AbortSignal): Promise<A>;
  /**
   * Aborts every running operation and waits for all of them to settle; repeat calls share it.
   * @returns A promise that settles once everything the owner ran has finished.
   */
  close(): Promise<void>;
}

/**
 * Creates a {@link WorkOwner}.
 * @returns A new open owner.
 */
export function createWorkOwner(): WorkOwner {
  const controller = new AbortController();
  const running = new Set<Promise<unknown>>();
  let closing: Promise<void> | undefined;
  return {
    get closed() {
      return controller.signal.aborted;
    },
    run(work, signal) {
      if (controller.signal.aborted)
        return Promise.reject(new DOMException("The owner is closed.", "AbortError"));
      const combined =
        signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]);
      const promise = Promise.resolve().then(() => work(combined));
      running.add(promise);
      void promise.then(
        () => running.delete(promise),
        () => running.delete(promise),
      );
      return promise;
    },
    close() {
      closing ??= (async () => {
        controller.abort(new DOMException("The owner is closed.", "AbortError"));
        while (running.size > 0) await Promise.allSettled([...running]);
      })();
      return closing;
    },
  };
}

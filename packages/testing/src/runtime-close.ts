import { Effect } from "effect";

/**
 * Waits for bounded admitted work before cleaning temporary ownership.
 * @param pending - Admitted native work or approval state owned by this harness.
 * @param timeoutMs - Explicit close deadline in milliseconds.
 * @param cleanup - Owned root release hook.
 * @param failed - Getter preserving whether admitted work or the caller marked failure.
 * @returns Completion after cleanup records failure or deadline exhaustion.
 */
export const closeRuntime = Effect.fn("Testing.runtime.joinCleanup")(function* (
  pending: Set<Promise<unknown>>,
  timeoutMs: number,
  cleanup: (failed: boolean) => Effect.Effect<void, unknown>,
  failed: () => boolean,
) {
  const completed = yield* Effect.tryPromise({
    try: () => waitForPending(pending, timeoutMs),
    catch: (cause) => cause,
  });
  yield* cleanup(failed() || !completed);
});

/**
 * Bridges native Promise completion receipts and the explicit host close deadline.
 * @param pending - Admitted native work or approval state owned by this harness.
 * @param timeoutMs - Explicit close deadline in milliseconds.
 * @returns True for complete settlement, false when the deadline wins.
 */
async function waitForPending(pending: Set<Promise<unknown>>, timeoutMs: number): Promise<boolean> {
  const all = Promise.allSettled([...pending]).then(() => undefined);
  if (pending.size === 0) {
    await all;
    return true;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const completed = await Promise.race([all.then(() => true), timeout]);
  if (timer !== undefined) clearTimeout(timer);
  return completed;
}

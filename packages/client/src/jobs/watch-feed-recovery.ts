import { delay } from "../native/iterate.js";
import { JobWatchAbortedError } from "./types.js";
import { backoff, isUnauthorized } from "./watch-feed-support.js";
import type { WatchFeedLoop } from "./watch-feed-loop.types.js";

/**
 * Runs observation attempts while the feed generation is active, each with its own request owner.
 * @typeParam Run - Observed snapshot payload.
 * @param feed - Shared observation state.
 * @param generation - Active epoch.
 * @param signal - Abort that stops the attempts; it aborts the current attempt's requests.
 * @param attempt - One native or polling attempt using the supplied request owner.
 * @param failed - Optional callback run before recovery of a failed attempt.
 * @returns Settles once the generation retires; rejects on abort or after the retry budget.
 */
export async function runFeedAttempts<Run>(
  feed: WatchFeedLoop<Run>,
  generation: number,
  signal: AbortSignal | undefined,
  attempt: (controller: AbortController) => Promise<void>,
  failed?: () => void,
): Promise<void> {
  while (feed.isActive(generation)) {
    if (signal?.aborted === true) throw new JobWatchAbortedError();
    const controller = new AbortController();
    const stop = (): void => controller.abort();
    signal?.addEventListener("abort", stop, { once: true });
    feed.setAbort(controller);
    try {
      await attempt(controller);
    } catch (error) {
      failed?.();
      await recoverWatchFeed(feed, generation, error, controller);
    } finally {
      signal?.removeEventListener("abort", stop);
      controller.abort();
      feed.setAbort(undefined);
    }
  }
}

/**
 * Applies the bounded, idempotent observation retry policy without retrying server work.
 * @typeParam Run - Observed snapshot payload.
 * @param feed - Shared observation state.
 * @param generation - Active epoch.
 * @param error - Original transport/reconciliation rejection.
 * @param controller - This attempt's request owner.
 * @returns Settles after the retry delay; rejects with the original error once retries end,
 * or with {@link JobWatchAbortedError} when the attempt was aborted or retired.
 */
export async function recoverWatchFeed<Run>(
  feed: WatchFeedLoop<Run>,
  generation: number,
  error: unknown,
  controller: AbortController,
): Promise<void> {
  if (controller.signal.aborted || !feed.isActive(generation)) throw new JobWatchAbortedError();
  const failures = feed.failureCount() + 1;
  feed.setFailureCount(failures);
  if (isUnauthorized(error) || failures >= (feed.options.maxReconnectAttempts ?? 10)) {
    feed.emit({
      kind: "status",
      status: isUnauthorized(error) ? "unauthorized" : "error",
      error,
    });
    feed.rejectFirsts(error);
    feed.releaseTerminal();
    throw error;
  }
  feed.emit({ kind: "status", status: "reconnecting", error });
  await delay(backoff(failures, feed.options), controller.signal);
}

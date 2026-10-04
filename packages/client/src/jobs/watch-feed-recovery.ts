import { Effect } from "effect";
import { backoff, isUnauthorized } from "./watch-feed-support.js";
import type { WatchFeedLoop } from "./watch-feed-loop.types.js";
/**
 * Applies the bounded, idempotent observation retry policy without retrying server work.
 * @typeParam Run - Observed snapshot payload.
 * @param feed - Shared observation state.
 * @param generation - Active epoch.
 * @param error - Original transport/reconciliation rejection.
 * @param controller - This attempt's request owner.
 * @returns A lazy retry delay or completed terminal error publication.
 */
export function recoverWatchFeed<Run>(
  feed: WatchFeedLoop<Run>,
  generation: number,
  error: unknown,
  controller: AbortController,
): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    if (controller.signal.aborted || !feed.isActive(generation)) return yield* Effect.interrupt;
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
      return yield* Effect.fail(error);
    }
    feed.emit({ kind: "status", status: "reconnecting", error });
    yield* Effect.sleep(backoff(failures, feed.options));
  });
}

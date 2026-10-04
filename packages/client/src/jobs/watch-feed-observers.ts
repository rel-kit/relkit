import type { WatchFeedObservers } from "./watch-feed-observers.types.js";
import type { Pending } from "./watch-feed-support.js";
import type { FeedEvent, FeedObserver } from "./watch-feed.types.js";
export type { WatchFeedObservers } from "./watch-feed-observers.types.js";

/**
 * Publishes to each observer while isolating synchronous view failures.
 * @typeParam Run - Application-specific observed run payload.
 * @param observers - Existing observer leases and first-snapshot authority.
 * @param event - Canonical observation event.
 * @returns Nothing; the existing owned state or publication is updated.
 */
export function emitObservers<Run>(
  observers: WatchFeedObservers<Run>,
  event: FeedEvent<Run>,
): void {
  for (const { observer } of observers.values()) {
    try {
      observer(event);
    } catch {
      // A view callback cannot stop the shared native feed.
    }
  }
}

/**
 * Settles each pending first-snapshot Promise after authoritative evidence.
 * @typeParam Run - Application-specific observed run payload.
 * @param observers - Existing observer leases and first-snapshot authority.
 * @returns Nothing; the existing owned state or publication is updated.
 */
export function resolveObserverFirsts<Run>(observers: WatchFeedObservers<Run>): void {
  for (const { first } of observers.values()) first.resolve();
}

/**
 * Rejects pending first-snapshot Promises with the original failure object.
 * @typeParam Run - Application-specific observed run payload.
 * @param observers - Existing observer leases and first-snapshot authority.
 * @param error - Original public failure object.
 * @returns Nothing; the existing owned state or publication is updated.
 */
export function rejectObserverFirsts<Run>(
  observers: WatchFeedObservers<Run>,
  error: unknown,
): void {
  for (const { first } of observers.values()) first.reject(error);
}

/**
 * Aborts the observer request and clears leases after authoritative completion.
 * @typeParam Run - Application-specific observed run payload.
 * @param observers - Existing observer leases and first-snapshot authority.
 * @param abort - Owned request cancellation controller.
 * @param onEmpty - Sharing-registry invalidation callback.
 * @returns Nothing; the existing owned state or publication is updated.
 */
export function releaseWatchFeedTerminal<Run>(
  observers: Map<string, { readonly observer: FeedObserver<Run>; readonly first: Pending }>,
  abort: AbortController | undefined,
  onEmpty: () => void,
): void {
  abort?.abort();
  observers.clear();
  onEmpty();
}

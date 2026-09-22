import type { Pending } from "./watch-feed-support.js";
import type { FeedEvent, FeedObserver } from "./watch-feed-types.js";

export type WatchFeedObservers<Run> = ReadonlyMap<
  string,
  { readonly observer: FeedObserver<Run>; readonly first: Pending }
>;

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

export function resolveObserverFirsts<Run>(observers: WatchFeedObservers<Run>): void {
  for (const { first } of observers.values()) first.resolve();
}

export function rejectObserverFirsts<Run>(
  observers: WatchFeedObservers<Run>,
  error: unknown,
): void {
  for (const { first } of observers.values()) first.reject(error);
}

export function releaseWatchFeedTerminal<Run>(
  observers: Map<string, { readonly observer: FeedObserver<Run>; readonly first: Pending }>,
  abort: AbortController | undefined,
  onEmpty: () => void,
): void {
  abort?.abort();
  observers.clear();
  onEmpty();
}

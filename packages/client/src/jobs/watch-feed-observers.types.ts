import type { Pending } from "./watch-feed-support.js";
import type { FeedObserver } from "./watch-feed.types.js";

/**
 * Each feed lease's callback and shared first-snapshot settlement authority.
 * @typeParam Run - Application-specific run payload retained by the observation state.
 */
export type WatchFeedObservers<Run> = ReadonlyMap<
  string,
  { readonly observer: FeedObserver<Run>; readonly first: Pending }
>;

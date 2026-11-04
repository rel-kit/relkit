import { createJobFeedRegistry } from "./feed-registry.service.js";
export { SharedWatchFeed } from "./watch-feed.js";
export type { FeedEvent, FeedStatus } from "./watch-feed.types.js";

// With no borrowers the registry owns no native work, timer or connection. Every
// controller and temporary refetch releases its borrow; the final release closes the feed.
/** Process-wide reference-counted registry used by controller operations. */
export const jobFeedRegistry = createJobFeedRegistry();

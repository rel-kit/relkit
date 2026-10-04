import { Layer, ManagedRuntime } from "effect";
import { runExecutionSync } from "@relkit/contracts/operation";
import { JobFeedRegistry, JobFeedRegistryLive } from "./feed-registry.service.js";
export { SharedWatchFeed } from "./watch-feed.js";
export type { FeedEvent, FeedStatus } from "./watch-feed.types.js";

// The registry's entries are acquired by explicit borrower scopes. With no
// borrowers it owns no native work, timer or connection. Every controller and
// temporary refetch closes its borrow; RcMap's zero TTL joins final feed cleanup.
const owner = ManagedRuntime.make(JobFeedRegistryLive);
/** Once-acquired reference-counted registry used by controller operations. */
export const jobFeedRegistry = runExecutionSync(owner, JobFeedRegistry);
/** Borrowed browser registry; each controller closes its explicit RcMap borrow. */
export const JobFeedRegistryDefault = Layer.succeed(JobFeedRegistry, jobFeedRegistry);

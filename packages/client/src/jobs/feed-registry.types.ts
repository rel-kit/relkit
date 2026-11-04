import type { JobWatchOptions } from "./types.js";
import type { SharedWatchFeed } from "./watch-feed.js";

/** One physical feed shared by independently retired passive view leases. */
export interface WatchFeedGroup {
  readonly feed: SharedWatchFeed<unknown>;
  references: number;
  closing?: Promise<void>;
}
/** One independently closable reference to a shared feed. */
export interface WatchFeedBorrow {
  readonly feed: SharedWatchFeed<unknown>;
  /** Passive view retirement; excludes a final retiring group before native callbacks can reconnect. */
  readonly retireView: () => void;
  /** Retires the view, then joins the shared feed's cleanup when it was the final reference. */
  readonly releaseView: () => Promise<void>;
}
/** Reference-counted observation registry, with complete request authority. */
export interface JobFeedRegistryService {
  /** Registers a passive external-store view, sharing a feed within its complete key. */
  readonly borrowView: (client: unknown, name: string, options: JobWatchOptions) => WatchFeedBorrow;
  /** Closes every retained feed and refuses later borrows; repeat calls share it. */
  readonly close: () => Promise<void>;
}

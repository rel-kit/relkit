import type { Effect, Ref, Scope } from "effect";
import type { JobWatchOptions } from "./types.js";
import type { SharedWatchFeed } from "./watch-feed.js";

/** One native RcMap borrow shared by independently retired passive view leases. */
export interface WatchFeedGroup {
  readonly feed: SharedWatchFeed<unknown>;
  readonly scope: Scope.Closeable;
  readonly references: Ref.Ref<number>;
}
/** One independently closable reference to a shared feed. */
export interface WatchFeedBorrow {
  readonly feed: SharedWatchFeed<unknown>;
  /** Excludes a final retiring group before native callbacks can reconnect. */
  readonly retire: Effect.Effect<void>;
  readonly release: Effect.Effect<void>;
  /** Passive view retirement; this boundary never awaits native work. */
  readonly retireView: () => void;
  /** Joins the shared native borrow after passive view retirement. */
  readonly releaseView: () => Promise<void>;
}
/** Reference-counted observation registry, with complete request authority. */
export interface JobFeedRegistryService {
  /** Registers a passive external-store view without another Layer acquisition. */
  readonly borrowView: (client: unknown, name: string, options: JobWatchOptions) => WatchFeedBorrow;
  readonly borrow: (
    client: unknown,
    name: string,
    options: JobWatchOptions,
  ) => Effect.Effect<WatchFeedBorrow>;
}

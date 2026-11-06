import { SharedWatchFeed } from "./watch-feed.js";
import { WatchFeedKey } from "./watch-key.js";
import type {
  JobFeedRegistryService,
  WatchFeedBorrow,
  WatchFeedGroup,
} from "./feed-registry.types.js";
import { JobWatchAbortedError, type JobWatchOptions } from "./types.js";

/**
 * Creates a reference-counted feed registry that shares within complete security/protocol keys.
 * @remarks Each entry closes after its final borrow. Terminal invalidation removes lookup
 * authority immediately while outstanding borrows keep the old feed until they release it.
 * @returns A registry whose `close` joins every retained native feed.
 * @example
 * ```ts
 * import { createJobFeedRegistry } from "./feed-registry.service.js";
 * export async function watchOnce(client: Parameters<ReturnType<typeof createJobFeedRegistry>["borrowView"]>[0]) {
 *   const registry = createJobFeedRegistry();
 *   const borrow = registry.borrowView(client, "job", { runId: "run" });
 *   try { await borrow.feed.addLease("view", () => undefined); }
 *   finally { await borrow.releaseView(); await registry.close(); }
 * }
 * ```
 * @see tests/jobs/registry.test.ts for checked native cleanup.
 */
export function createJobFeedRegistry(): JobFeedRegistryService {
  const groups = new Map<string, WatchFeedGroup>();
  const live = new Set<WatchFeedGroup>();
  let closed: Promise<void> | undefined;
  const closeGroup = (group: WatchFeedGroup): Promise<void> => {
    live.delete(group);
    return (group.closing ??= group.feed.close());
  };
  /** Registers a passive view over an existing or new physical feed.
   * @param client - Borrowed transport identity.
   * @param name - Declared job identity.
   * @param options - Complete security and protocol authority.
   * @returns A view reference whose final release joins the physical feed. */
  const borrowView = (client: unknown, name: string, options: JobWatchOptions): WatchFeedBorrow => {
    if (closed !== undefined) throw new JobWatchAbortedError();
    const key = new WatchFeedKey(client, name, options);
    let group = groups.get(key.value);
    if (group === undefined) {
      const feed: SharedWatchFeed<unknown> = new SharedWatchFeed(
        key.client,
        key.name,
        key.options,
        () => {
          if (groups.get(key.value)?.feed === feed) groups.delete(key.value);
        },
      );
      group = { feed, references: 0 };
      groups.set(key.value, group);
      live.add(group);
    }
    const entry = group;
    entry.references += 1;
    let retired = false;
    let closing: Promise<void> | undefined;
    const retireView = (): void => {
      if (retired) return;
      retired = true;
      entry.references -= 1;
      if (entry.references === 0 && groups.get(key.value) === entry) groups.delete(key.value);
    };
    const releaseView = (): Promise<void> => {
      retireView();
      return (closing ??= entry.references === 0 ? closeGroup(entry) : Promise.resolve());
    };
    return { feed: entry.feed, retireView, releaseView };
  };
  return {
    borrowView,
    close: () =>
      (closed ??= (async () => {
        groups.clear();
        await Promise.all([...live].map(closeGroup));
      })()),
  };
}

import { SharedWatchFeed } from "./watch-feed.js";
import type { JobWatchOptions } from "./types.js";

const feedIds = new WeakMap<object, number>();
let nextFeedId = 1;
const feeds = new Map<string, SharedWatchFeed<unknown>>();

export { SharedWatchFeed } from "./watch-feed.js";
export type { FeedEvent, FeedStatus } from "./watch-feed.js";

export function sharedWatchFeed<Run>(
  client: unknown,
  name: string,
  options: JobWatchOptions,
): SharedWatchFeed<Run> {
  const key = feedKey(client, name, options);
  const existing = feeds.get(key) as SharedWatchFeed<Run> | undefined;
  if (existing !== undefined) return existing;
  const created = new SharedWatchFeed<Run>(client, name, options, () => {
    if (feeds.get(key) === created && !created.hasLeases) feeds.delete(key);
  });
  feeds.set(key, created as SharedWatchFeed<unknown>);
  return created;
}

export function releaseSharedWatchFeed(
  client: unknown,
  name: string,
  options: JobWatchOptions,
  feed: SharedWatchFeed<unknown>,
): void {
  const key = feedKey(client, name, options);
  if (feeds.get(key) === feed && !feed.hasLeases) feeds.delete(key);
}

function feedKey(client: unknown, name: string, options: JobWatchOptions): string {
  return JSON.stringify([
    clientId(client),
    name,
    options.jobId ?? name,
    options.runId,
    options.after ?? "",
    options.identityKey ?? "",
    options.expectedIdentity?.identityScope ?? "",
    options.expectedIdentity?.sessionEpoch ?? "",
    options.applicationId ?? "",
    options.environment ?? "",
    options.grantScope ?? "",
    options.projection ?? "",
    options.schemaVersion ?? "",
    options.protocolVersion ?? 1,
    options.source ?? "native",
    options.pollIntervalMs ?? 2_000,
    options.readTimeoutMs ?? 10_000,
    options.maxReconnectAttempts ?? 10,
    options.reconnectMinDelayMs ?? 500,
    options.reconnectMaxDelayMs ?? 30_000,
  ]);
}

function clientId(value: unknown): string | number {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return String(value);
  let id = feedIds.get(value);
  if (id === undefined) {
    id = nextFeedId++;
    feedIds.set(value, id);
  }
  return id;
}

import { Equal, Hash } from "effect";
import type { JobWatchOptions } from "./types.js";
const feedIds = new WeakMap<object, number>();
let nextFeedId = 1;

/** Complete immutable sharing identity with borrowed transport/configuration. */
export class WatchFeedKey implements Equal.Equal {
  readonly value: string;
  /**
   * Serializes every existing authorization, protocol, cursor and retry boundary.
   * @param client - Transport object, compared by its existing WeakMap identity.
   * @param name - Declared job.
   * @param options - Complete observation authority.
   * @returns The owner or public error instance.
   */
  constructor(
    readonly client: unknown,
    readonly name: string,
    readonly options: JobWatchOptions,
  ) {
    this.value = feedKey(client, name, options);
  }
  /** @param that - Other key. @returns Equality by the complete existing key. */
  [Equal.symbol](that: Equal.Equal): boolean {
    return that instanceof WatchFeedKey && that.value === this.value;
  }
  /** @returns Stable hash of the complete existing serialized key. */
  [Hash.symbol](): number {
    return Hash.string(this.value);
  }
}

/**
 * Serializes every existing transport, identity, protocol, projection, cursor and retry boundary.
 * @param client - Borrowed generated procedure client.
 * @param name - Declared resource or selector identity.
 * @param options - Existing public configuration and authority.
 * @returns The complete canonical sharing key.
 */
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

/**
 * Assigns stable weak object identity without retaining transports globally.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns A stable weak transport identity or primitive identity.
 */
function clientId(value: unknown): string | number {
  if ((typeof value !== "object" && typeof value !== "function") || value === null)
    return String(value);
  let id = feedIds.get(value);
  if (id === undefined) {
    id = nextFeedId++;
    feedIds.set(value, id);
  }
  return id;
}

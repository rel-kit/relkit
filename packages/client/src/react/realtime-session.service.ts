import type { ClientIdentityDocument } from "relkit/contracts";
import { delay, iterateNative } from "../native/iterate.js";
import { createWorkOwner } from "../native/owner.js";
import { procedureCall } from "./procedure.js";
import { realtimeSubscriptionKey } from "./realtime-session-key.js";
import type {
  RealtimeFrame,
  RealtimeSessionService,
  RealtimeStatus,
  SharedSubscription,
} from "./realtime-manager.types.js";

/**
 * Creates one manager's sharing registry, checkpoints and owned reconnect workers.
 * @param client - Borrowed transport, replaceable by a deterministic test client.
 * @param identity - Manager-local authorization/session boundary.
 * @returns Sessions whose close aborts and waits for every active connection.
 * @example
 * ```ts
 * import { createRealtimeSessions } from "./realtime-session.service.js";
 * export async function realtimeOwner(): Promise<void> {
 *   const sessions = createRealtimeSessions({});
 *   try { sessions.snapshot(); }
 *   finally { await sessions.close(); }
 * }
 * ```
 * @see packages/client/tests/transport/examples.test.ts for the checked example.
 */
export function createRealtimeSessions(
  client: unknown,
  identity?: Pick<ClientIdentityDocument, "identityScope" | "sessionEpoch">,
): RealtimeSessionService {
  const owner = createWorkOwner();
  const feeds = new Map<string, SharedSubscription>();
  const statusListeners = new Set<() => void>();
  let state: RealtimeStatus = "idle";
  let stopped = false;
  let closing: Promise<void> | undefined;
  /** Publishes manager state only when it changes.
   * @param status - The next manager state. */
  const setStatus = (status: RealtimeStatus): void => {
    if (state === status) return;
    state = status;
    for (const listener of statusListeners) safely(listener);
  };
  /** Publishes connection status to both manager and channel observers.
   * @param shared - Current shared connection.
   * @param status - Its next native lifecycle state. */
  const report = (shared: SharedSubscription, status: RealtimeStatus): void => {
    setStatus(status);
    if (shared.status === status) return;
    shared.status = status;
    for (const listener of shared.statusListeners) safely(() => listener(status));
  };
  /** Pulls ordered frames with no intermediate buffer and owns reconnect delays.
   * @param key - Complete manager-local sharing key.
   * @param channel - Declared channel name.
   * @param params - Borrowed channel parameters.
   * @param shared - Current connection, checkpoint and cancellation owner.
   * @param signal - Aborted when the final borrower releases or the owner closes.
   * @returns Connection work until the signal aborts. */
  const consume = async (
    key: string,
    channel: string,
    params: unknown,
    shared: SharedSubscription,
    signal: AbortSignal,
  ): Promise<void> => {
    while (!signal.aborted && feeds.get(key) === shared) {
      report(shared, "connecting");
      try {
        const frames = iterateNative<RealtimeFrame>(
          async (request) => {
            const stream = await procedureCall(client, "relkit.realtime.subscribe")(
              {
                channel,
                params,
                after: shared.checkpoint,
                ...(identity === undefined ? {} : { expectedIdentity: identity }),
              },
              { signal: request },
            );
            return (stream as AsyncIterable<RealtimeFrame>)[Symbol.asyncIterator]();
          },
          { signal, opened: () => report(shared, "connected") },
        );
        // Zero buffer: each frame is published before the next pull.
        for await (const frame of frames) {
          if (signal.aborted || feeds.get(key) !== shared) break;
          if ("checkpoint" in frame) shared.checkpoint = frame.checkpoint;
          for (const listener of shared.listeners) safely(() => listener(frame));
        }
        if (!signal.aborted) report(shared, "stale");
      } catch {
        if (!signal.aborted) report(shared, "error");
      }
      if (!signal.aborted) await delay(250, signal).catch(() => undefined);
    }
  };
  const stop = (): void => {
    stopped = true;
    for (const shared of feeds.values()) shared.controller.abort();
    feeds.clear();
    setStatus("idle");
  };
  return {
    feeds,
    statusListeners,
    snapshot: () => state,
    stop,
    close: () => {
      stop();
      return (closing ??= owner.close());
    },
    subscribe: (channel, params, listener, statusListener) => {
      if (stopped) throw new Error("Realtime manager is disposed.");
      const key = realtimeSubscriptionKey(channel, params);
      let shared = feeds.get(key);
      const created = shared === undefined;
      if (shared === undefined) {
        shared = {
          controller: new AbortController(),
          listeners: new Set(),
          statusListeners: new Set(),
          status: "connecting",
        };
        feeds.set(key, shared);
      }
      const entry = shared;
      entry.listeners.add(listener);
      if (statusListener !== undefined) {
        entry.statusListeners.add(statusListener);
        safely(() => statusListener(entry.status));
      }
      if (created)
        void owner
          .run((signal) => consume(key, channel, params, entry, signal), entry.controller.signal)
          .catch(() => undefined);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        entry.listeners.delete(listener);
        if (statusListener !== undefined) entry.statusListeners.delete(statusListener);
        if (entry.listeners.size !== 0) return;
        entry.controller.abort();
        feeds.delete(key);
        if (feeds.size === 0) setStatus("idle");
      };
    },
  };
}

/**
 * Isolates synchronous view callbacks from the shared native workflow.
 * @param callback - One observer callback.
 * @returns Nothing; a view cannot fail another observer's lease.
 */
function safely(callback: () => void): void {
  try {
    callback();
  } catch {}
}

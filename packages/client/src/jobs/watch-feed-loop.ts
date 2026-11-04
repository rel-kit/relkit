import { iterateNative } from "../native/iterate.js";
import { openWatchIterator, authoritativeFrame, watchRequest } from "./reconcile.js";
import { isTerminalRun } from "./types.js";
import { readWatchNext } from "./read-timeout.js";
import { browserOffline, offline, resetFrame, withAfter } from "./watch-feed-support.js";
import { runFeedAttempts } from "./watch-feed-recovery.js";
import type { WatchFeedLoop } from "./watch-feed-loop.types.js";
import { runPollingFeed } from "./watch-feed-polling.js";
export type { WatchFeedLoop } from "./watch-feed-loop.types.js";

/**
 * Runs the native observation/reconciliation/retry state machine.
 * @typeParam Run - Application-specific snapshot payload.
 * @param feed - Shared state and observer authority acquired once for this feed.
 * @param generation - Epoch guard preventing retired workers from publishing.
 * @param signal - Abort that stops observation and every native request it owns.
 * @returns Settles on confirmed terminal evidence or retirement; rejects on abort or exhaustion.
 */
export async function runWatchFeed<Run>(
  feed: WatchFeedLoop<Run>,
  generation: number,
  signal?: AbortSignal,
): Promise<void> {
  if (feed.options.source === "polling") return runPollingFeed(feed, generation, signal);
  await runFeedAttempts(feed, generation, signal, async (controller) => {
    try {
      await watchAttempt(feed, generation, controller);
    } finally {
      feed.setIterator(undefined);
    }
  });
}

/**
 * Observes one native watch connection, then reconciles its end through an authoritative read.
 * @typeParam Run - Application-specific snapshot payload.
 * @param feed - Shared state and observer authority.
 * @param generation - Epoch guard preventing retired workers from publishing.
 * @param controller - This attempt's request owner.
 * @returns Settles on terminal evidence or retirement; rejects when the watch ends without it.
 */
async function watchAttempt<Run>(
  feed: WatchFeedLoop<Run>,
  generation: number,
  controller: AbortController,
): Promise<void> {
  if (browserOffline() && (await offline(controller.signal))) return;
  let needsReset = feed.failureCount() > 0;
  feed.emit({
    kind: "status",
    status: feed.failureCount() === 0 ? "connecting" : "reconnecting",
  });
  const frames = iterateNative(
    async (signal) => {
      const iterator = await openWatchIterator(
        feed.client,
        feed.name,
        watchRequest(feed.options, feed.lastCursor()),
        signal,
        feed.options.readTimeoutMs,
      );
      feed.setIterator(iterator);
      return iterator;
    },
    {
      signal: controller.signal,
      opened: () => feed.emit({ kind: "status", status: "connected" }),
      read: (iterator, signal) => readWatchNext(iterator, signal, feed.options.readTimeoutMs),
    },
  );
  for await (const value of frames) {
    if (!feed.isActive(generation)) break;
    const frame = feed.acceptFrame(needsReset ? resetFrame(value) : value);
    if (frame === undefined) continue;
    needsReset = false;
    feed.setFailureCount(0);
    if (isTerminalRun(frame.run)) {
      const confirmed = await feed.verifyTerminal(frame, controller.signal);
      if (confirmed === true) {
        feed.emit({ kind: "status", status: "completed" });
        feed.resolveFirsts();
        feed.releaseTerminal();
        return;
      }
      if (confirmed === false) feed.resolveFirsts();
    } else {
      feed.emit({ kind: "frame", frame });
      feed.resolveFirsts();
    }
  }
  if (controller.signal.aborted || !feed.isActive(generation)) return;
  const reconciled = await authoritativeFrame(
    feed.client,
    feed.name,
    withAfter(feed.options, feed.lastCursor()),
    controller.signal,
  );
  if (reconciled !== undefined) {
    const frame = feed.acceptFrame(needsReset ? resetFrame(reconciled) : reconciled);
    if (frame !== undefined) {
      feed.setFailureCount(0);
      feed.emit({ kind: "frame", frame });
      if (isTerminalRun(frame.run)) {
        feed.emit({ kind: "status", status: "completed" });
        feed.resolveFirsts();
        feed.releaseTerminal();
        return;
      }
    }
  }
  throw new Error("Job watch ended before terminal evidence was available.");
}

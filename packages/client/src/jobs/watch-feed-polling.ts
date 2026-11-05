import { delay } from "../native/iterate.js";
import { authoritativeFrame } from "./reconcile.js";
import { isTerminalRun, JobWatchAbortedError } from "./types.js";
import type { WatchFeedLoop } from "./watch-feed-loop.types.js";
import { runFeedAttempts } from "./watch-feed-recovery.js";
import { browserOffline, offline, withAfter } from "./watch-feed-support.js";

/**
 * Observes authoritative snapshots on the existing poll interval and retry policy.
 * @typeParam Run - Observed snapshot payload.
 * @param feed - Shared feed state and observer authority.
 * @param generation - Epoch guard for retired polling work.
 * @param signal - Abort that stops polling and its in-flight read.
 * @returns Settles on confirmed terminal evidence or retirement; rejects on abort or exhaustion.
 */
export async function runPollingFeed<Run>(
  feed: WatchFeedLoop<Run>,
  generation: number,
  signal?: AbortSignal,
): Promise<void> {
  let connected = false;
  let lastSnapshot: string | undefined;
  await runFeedAttempts(
    feed,
    generation,
    signal,
    async (controller) => {
      if (browserOffline() && (await offline(controller.signal))) return;
      if (!connected)
        feed.emit({
          kind: "status",
          status: feed.failureCount() === 0 ? "connecting" : "reconnecting",
        });
      const observed = await authoritativeFrame(
        feed.client,
        feed.name,
        withAfter(feed.options, feed.lastCursor()),
        controller.signal,
      );
      if (observed === undefined) throw new Error("Polling returned no run snapshot.");
      if (!feed.isActive(generation)) return;
      const snapshot = JSON.stringify({ run: observed.run, cursor: observed.cursor });
      const frame = snapshot === lastSnapshot ? undefined : feed.acceptFrame(observed);
      lastSnapshot = snapshot;
      if (!connected) {
        feed.emit({ kind: "status", status: "connected" });
        connected = true;
      }
      if (frame !== undefined) {
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
      if (controller.signal.aborted) throw new JobWatchAbortedError();
      const requested = feed.options.pollIntervalMs ?? 2_000;
      await delay(
        Number.isFinite(requested) ? Math.max(2_000, requested) : 2_000,
        controller.signal,
      );
    },
    () => {
      connected = false;
    },
  );
}

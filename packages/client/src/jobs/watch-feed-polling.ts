import type { RunWatchFrame } from "@relkit/contracts/jobs";
import { authoritativeFrame } from "./reconcile.js";
import { isTerminalRun, type JobWatchOptions } from "./types.js";
import type { WatchFeedLoop } from "./watch-feed-loop.js";
import { backoff, isUnauthorized, offline, wait, withAfter } from "./watch-feed-support.js";

export async function runPollingFeed<Run>(
  feed: WatchFeedLoop<Run>,
  generation: number,
): Promise<void> {
  let connected = false;
  let lastSnapshot: string | undefined;
  while (feed.isActive(generation)) {
    const controller = new AbortController();
    feed.setAbort(controller);
    if (await offline(controller.signal)) {
      feed.setAbort(undefined);
      continue;
    }
    try {
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
      const changed = snapshot !== lastSnapshot;
      let frame: RunWatchFrame<Run> | undefined;
      if (changed) {
        lastSnapshot = snapshot;
        frame = feed.acceptFrame(observed);
      }
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
      await wait(pollInterval(feed.options), controller.signal);
    } catch (error) {
      if (controller.signal.aborted || !feed.isActive(generation)) return;
      if (isUnauthorized(error)) {
        feed.emit({ kind: "status", status: "unauthorized", error });
        feed.rejectFirsts(error);
        return;
      }
      connected = false;
      const failures = feed.failureCount() + 1;
      feed.setFailureCount(failures);
      if (failures >= (feed.options.maxReconnectAttempts ?? 10)) {
        feed.emit({ kind: "status", status: "error", error });
        feed.rejectFirsts(error);
        return;
      }
      feed.emit({ kind: "status", status: "reconnecting", error });
      await wait(backoff(failures, feed.options), controller.signal);
    } finally {
      feed.setAbort(undefined);
    }
  }
}

function pollInterval(options: JobWatchOptions): number {
  const requested = options.pollIntervalMs ?? 2_000;
  return Number.isFinite(requested) ? Math.max(2_000, requested) : 2_000;
}

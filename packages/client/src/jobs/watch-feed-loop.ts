import type { RunWatchFrame } from "@relkit/contracts/jobs";
import { closeIterator, openWatchIterator, authoritativeFrame, watchRequest } from "./reconcile.js";
import { readWatchNext } from "./read-timeout.js";
import { isTerminalRun, type JobWatchOptions } from "./types.js";
import { backoff, closeEmptyIterator, isUnauthorized, offline, resetFrame, wait, withAfter } from "./watch-feed-support.js";
import type { FeedEvent } from "./watch-feed.js";

export interface WatchFeedLoop<Run> {
  readonly client: unknown;
  readonly name: string;
  readonly options: JobWatchOptions;
  readonly isActive: (generation: number) => boolean;
  readonly lastCursor: () => string | undefined;
  readonly setAbort: (controller: AbortController | undefined) => void;
  readonly setIterator: (iterator: AsyncIterator<unknown> | undefined) => void;
  readonly acceptFrame: (value: unknown) => RunWatchFrame<Run> | undefined;
  readonly emit: (event: FeedEvent<Run>) => void;
  readonly verifyTerminal: (frame: RunWatchFrame<Run>, signal: AbortSignal) => Promise<boolean | undefined>;
  readonly releaseTerminal: () => void;
  readonly resolveFirsts: () => void;
  readonly rejectFirsts: (error: unknown) => void;
  readonly failureCount: () => number;
  readonly setFailureCount: (value: number) => void;
}

export async function runWatchFeed<Run>(feed: WatchFeedLoop<Run>, generation: number): Promise<void> {
  if (feed.options.source === "polling") {
    await runPollingFeed(feed, generation);
    return;
  }
  while (feed.isActive(generation)) {
    let needsReset = feed.failureCount() > 0;
    const controller = new AbortController();
    feed.setAbort(controller);
    if (await offline(controller.signal)) {
      feed.setAbort(undefined);
      continue;
    }
    feed.emit({
      kind: "status",
      status: feed.failureCount() === 0 ? "connecting" : "reconnecting",
    });
    let activeIterator: AsyncIterator<unknown> | undefined;
    try {
      const iterator = await openWatchIterator(
        feed.client,
        feed.name,
        watchRequest(feed.options, feed.lastCursor()),
        controller.signal,
        feed.options.readTimeoutMs,
      );
      activeIterator = iterator;
      feed.setIterator(iterator);
      if (!feed.isActive(generation)) return;
      feed.emit({ kind: "status", status: "connected" });
      while (!controller.signal.aborted && feed.isActive(generation)) {
        const next = await readWatchNext(iterator, controller.signal, feed.options.readTimeoutMs);
        if (next.done === true) break;
        const frame = feed.acceptFrame(needsReset ? resetFrame(next.value) : next.value);
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
          continue;
        }
        feed.emit({ kind: "frame", frame });
        feed.resolveFirsts();
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
          needsReset = false;
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
    } catch (error) {
      if (controller.signal.aborted || !feed.isActive(generation)) return;
      if (isUnauthorized(error)) {
        feed.emit({ kind: "status", status: "unauthorized", error });
        feed.rejectFirsts(error);
        return;
      }
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
      await closeIterator(activeIterator ?? closeEmptyIterator()).catch(() => undefined);
      feed.setIterator(undefined);
      feed.setAbort(undefined);
    }
  }
}

async function runPollingFeed<Run>(feed: WatchFeedLoop<Run>, generation: number): Promise<void> {
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
        feed.emit({ kind: "status", status: feed.failureCount() === 0 ? "connecting" : "reconnecting" });
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

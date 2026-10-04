import { Effect, Stream } from "effect";
import { nativeCall, nativeStream } from "../native-stream.js";
import { openWatchIterator, authoritativeFrame, watchRequest } from "./reconcile.js";
import { isTerminalRun } from "./types.js";
import { readWatchNext } from "./read-timeout.js";
import { offline, resetFrame, withAfter } from "./watch-feed-support.js";
import { recoverWatchFeed } from "./watch-feed-recovery.js";
import type { WatchFeedLoop } from "./watch-feed-loop.types.js";
import { runPollingFeed } from "./watch-feed-polling.js";
export type { WatchFeedLoop } from "./watch-feed-loop.types.js";

/**
 * Runs the native observation/reconciliation/retry state machine in its owner fiber.
 * @typeParam Run - Application-specific snapshot payload.
 * @param feed - Shared state and observer authority acquired once for this feed.
 * @param generation - Epoch guard preventing retired workers from publishing.
 * @returns Lazy work ending on confirmed terminal evidence, exhaustion or interruption.
 */
export const runWatchFeed = Effect.fn("JobObservation.consume")(
  <Run>(feed: WatchFeedLoop<Run>, generation: number): Effect.Effect<void, unknown> =>
    Effect.gen(function* () {
      if (feed.options.source === "polling") return yield* runPollingFeed(feed, generation);
      while (feed.isActive(generation)) {
        const controller = new AbortController();
        feed.setAbort(controller);
        yield* Effect.gen(function* () {
          if (yield* nativeCall(() => offline(controller.signal))) return;
          let needsReset = feed.failureCount() > 0;
          let terminal = false;
          feed.emit({
            kind: "status",
            status: feed.failureCount() === 0 ? "connecting" : "reconnecting",
          });
          const source = nativeStream(
            "jobs.watch.frames",
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
            controller.signal,
            Effect.sync(() => feed.emit({ kind: "status", status: "connected" })),
            (iterator, signal) => readWatchNext(iterator, signal, feed.options.readTimeoutMs),
          );
          yield* source.pipe(
            Stream.mapEffect((value) =>
              Effect.gen(function* () {
                if (!feed.isActive(generation)) return false;
                const frame = feed.acceptFrame(needsReset ? resetFrame(value) : value);
                if (frame === undefined) return true;
                needsReset = false;
                feed.setFailureCount(0);
                if (isTerminalRun(frame.run)) {
                  const confirmed = yield* nativeCall(() =>
                    feed.verifyTerminal(frame, controller.signal),
                  );
                  if (confirmed === true) {
                    terminal = true;
                    feed.emit({ kind: "status", status: "completed" });
                    feed.resolveFirsts();
                    feed.releaseTerminal();
                    return false;
                  }
                  if (confirmed === false) feed.resolveFirsts();
                } else {
                  feed.emit({ kind: "frame", frame });
                  feed.resolveFirsts();
                }
                return true;
              }),
            ),
            Stream.takeWhile((continuing) => continuing),
            Stream.runDrain,
          );
          if (terminal || controller.signal.aborted || !feed.isActive(generation)) return;
          const reconciled = yield* nativeCall(() =>
            authoritativeFrame(
              feed.client,
              feed.name,
              withAfter(feed.options, feed.lastCursor()),
              controller.signal,
            ),
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
          yield* Effect.fail(new Error("Job watch ended before terminal evidence was available."));
        }).pipe(
          Effect.catch((error) => recoverWatchFeed(feed, generation, error, controller)),
          Effect.ensuring(
            Effect.sync(() => {
              controller.abort();
              feed.setIterator(undefined);
              feed.setAbort(undefined);
            }),
          ),
        );
      }
    }),
);

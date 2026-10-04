import { Effect } from "effect";
import { nativeCall } from "../native-stream.js";
import { authoritativeFrame } from "./reconcile.js";
import { isTerminalRun } from "./types.js";
import type { WatchFeedLoop } from "./watch-feed-loop.types.js";
import { recoverWatchFeed } from "./watch-feed-recovery.js";
import { offline, withAfter } from "./watch-feed-support.js";

/**
 * Observes authoritative snapshots with the injected Clock and unchanged retry policy.
 * @typeParam Run - Observed snapshot payload.
 * @param feed - Shared feed state and observer authority.
 * @param generation - Epoch guard for retired polling work.
 * @returns Lazy polling ending only on confirmed terminal evidence or interruption.
 */
export const runPollingFeed = Effect.fn("JobObservation.poll")(
  <Run>(feed: WatchFeedLoop<Run>, generation: number): Effect.Effect<void, unknown> =>
    Effect.gen(function* () {
      let connected = false;
      let lastSnapshot: string | undefined;
      while (feed.isActive(generation)) {
        const controller = new AbortController();
        feed.setAbort(controller);
        yield* Effect.gen(function* () {
          if (yield* nativeCall(() => offline(controller.signal))) return;
          if (!connected)
            feed.emit({
              kind: "status",
              status: feed.failureCount() === 0 ? "connecting" : "reconnecting",
            });
          const observed = yield* nativeCall(() =>
            authoritativeFrame(
              feed.client,
              feed.name,
              withAfter(feed.options, feed.lastCursor()),
              controller.signal,
            ),
          );
          if (observed === undefined)
            return yield* Effect.fail(new Error("Polling returned no run snapshot."));
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
              const confirmed = yield* nativeCall(() =>
                feed.verifyTerminal(frame, controller.signal),
              );
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
          if (controller.signal.aborted) return yield* Effect.interrupt;
          const requested = feed.options.pollIntervalMs ?? 2_000;
          yield* Effect.sleep(Number.isFinite(requested) ? Math.max(2_000, requested) : 2_000);
        }).pipe(
          Effect.catch((error) => {
            connected = false;
            return recoverWatchFeed(feed, generation, error, controller);
          }),
          Effect.ensuring(
            Effect.sync(() => {
              controller.abort();
              feed.setAbort(undefined);
            }),
          ),
        );
      }
    }),
);

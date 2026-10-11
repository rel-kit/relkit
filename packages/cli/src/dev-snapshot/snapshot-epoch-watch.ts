/**
 * Owns a native recursive watch and synchronously advances its input witness.
 * Callbacks enqueue coalesced notifications; they never execute an Effect or
 * retain source bytes. Release invalidates the witness before native closure.
 */
import { watch } from "node:fs";
import { Effect, Queue } from "effect";
import { DevSnapshotIoError } from "./snapshot-error.js";
import { isSnapshotEpochPathRelevant } from "./snapshot-epoch-path.js";
import type { SnapshotEpochState } from "./snapshot-epoch.types.js";
import type { SnapshotEpochPreflight } from "./snapshot-preflight.types.js";

/**
 * Acquires input observation before initial snapshot byte reads.
 * @param root - Current installed project root.
 * @param state - Request-owned identity and native-event queue.
 * @returns Scoped physical watcher; native failures invalidate reuse immediately.
 */
export function acquireSnapshotEpochWatch(
  root: string,
  state: SnapshotEpochState,
  preflight?: SnapshotEpochPreflight,
) {
  if (preflight?.root === root) return adoptPreflight(state, preflight);
  return Effect.acquireRelease(
    Effect.try({
      try: () => {
        const watcher = watch(root, { recursive: true }, (_event, filename) => {
          if (filename !== null && !isSnapshotEpochPathRelevant(filename.toString())) return;
          state.revision += 1;
          Queue.offerUnsafe(
            state.events,
            Effect.succeed({ owner: state.owner, revision: state.revision }),
          );
        });
        watcher.on("error", (cause) => {
          state.failure = watchFailure("epoch.watch", cause);
          Queue.offerUnsafe(state.events, Effect.fail(state.failure));
        });
        return watcher;
      },
      catch: (cause) => watchFailure("epoch.acquire", cause),
    }),
    (watcher) =>
      Effect.sync(() => {
        state.failure = watchFailure("epoch.closed", new Error("Snapshot watch is closed"));
        watcher.close();
        Queue.shutdownUnsafe(state.events);
      }),
  );
}

/**
 * Adopts the earlier native witness without leaving a gap between hashing and validation.
 * @param state - Effect-owned revision and event queue.
 * @param preflight - Watch opened before the prepared command graph was imported.
 * @returns Scoped ownership of the same native watcher.
 */
function adoptPreflight(state: SnapshotEpochState, preflight: SnapshotEpochPreflight) {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const notify = () => {
        state.revision = preflight.revision;
        if (preflight.failure !== undefined)
          state.failure = watchFailure("epoch.watch", preflight.failure);
        Queue.offerUnsafe(
          state.events,
          state.failure === undefined
            ? Effect.succeed({ owner: state.owner, revision: state.revision })
            : Effect.fail(state.failure),
        );
      };
      preflight.notify = notify;
      state.revision = preflight.revision;
      if (preflight.failure !== undefined)
        state.failure = watchFailure("epoch.watch", preflight.failure);
      return preflight;
    }),
    (owned) =>
      Effect.sync(() => {
        owned.notify = undefined;
        state.failure = watchFailure("epoch.closed", new Error("Snapshot watch is closed"));
        owned.close();
        Queue.shutdownUnsafe(state.events);
      }),
  );
}

/**
 * Wraps native watch failures without private paths in the public diagnostic.
 * @typeParam Failure - Actual native failure captured only as the original cause.
 * @param operation - Fixed native operation context.
 * @param cause - Original native failure.
 * @returns Typed watch failure; defects and interruption are not recovered here.
 */
function watchFailure<Failure>(operation: string, cause: Failure) {
  return new DevSnapshotIoError({
    operation,
    cause: new Error("Snapshot input watch failed", { cause }),
  });
}

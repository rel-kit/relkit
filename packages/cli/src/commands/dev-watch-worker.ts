/** Debounces bounded watch events and serializes configuration refresh with source activation. */
import { Cause, Effect, Queue, Ref } from "effect";
import { cliTry } from "../cli-errors.js";
import { CliCleanup } from "../services/cleanup.service.js";
import type { SourceWatchOperations } from "../services/source-watch.types.js";
import { syncWatchConfigurations } from "./dev-watch-config.js";
import { activeScaffoldWatchFence } from "./dev-watch-paths.js";
import type { DevSession } from "./dev-session.js";
import type { DevWatchOwner } from "./dev-watch-owner.types.js";

/**
 * Consumes one bounded batch after its quiet window and the active scaffold fence.
 * @param session - Existing serialized generation activator.
 * @param native - Captured config watcher authority.
 * @param owner - Bounded event admission and lifetime state.
 * @returns Lazy batch activation; defects remain supervised by the worker owner.
 */
const consumeWatchBatch = Effect.fn("Dev.consumeWatchBatch")(function* (
  session: DevSession,
  native: SourceWatchOperations,
  owner: DevWatchOwner,
) {
  const state = owner.state,
    first = yield* Queue.take(state.events);
  yield* Effect.sleep(75);
  const batch = yield* Queue.takeBetween(state.events, 0, 256);
  if (Ref.getUnsafe(state.nativeFailures).length) return;
  const files = Object.freeze([...new Set([...first, ...batch.flat()])].sort().slice(-256));
  while (yield* cliTry("dev.watch.scaffold", () => activeScaffoldWatchFence(session.projectRoot))) {
    if (!Ref.getUnsafe(state.open)) return;
    yield* Effect.sleep(75);
  }
  if (!Ref.getUnsafe(state.open)) return;
  yield* syncWatchConfigurations(session.projectRoot, native, owner);
  if (session.options.sourceChangedEffect) yield* session.options.sourceChangedEffect(files);
  yield* session.nativeEngine.activate(undefined, files);
});

/**
 * Starts a joined worker and retains non-interruption failures in the existing cleanup ledger.
 * @param session - Native shutdown/activation authority.
 * @param native - Captured watcher capability.
 * @param owner - Invocation-owned event queue and worker Scope.
 * @returns Worker acquisition; its Scope joins termination before release receipts are drained.
 */
export const startWatchWorker = Effect.fn("Dev.startWatchWorker")(function* (
  session: DevSession,
  native: SourceWatchOperations,
  owner: DevWatchOwner,
) {
  const cleanup = yield* CliCleanup;
  yield* Effect.forkIn(
    Effect.forever(consumeWatchBatch(session, native, owner)).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.void;
        return cleanup
          .record("dev.watch.worker", cause)
          .pipe(
            Effect.andThen(
              Effect.sync(() => session.nativeEngine.requestStop(Cause.squash(cause))),
            ),
          );
      }),
    ),
    owner.state.scope,
  );
});

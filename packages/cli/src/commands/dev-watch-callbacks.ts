/** Native callbacks only enqueue bounded events or request shutdown; no nested runtime runs. */
import { MutableRef, Queue, Ref } from "effect";
import type { DevSession } from "./dev-session.js";
import type { DevWatchCallbacks, DevWatchState } from "./dev-watch-owner.types.js";

/**
 * Preserves native Error identity and normalizes other rejection values once.
 * @typeParam Reason - Native callback rejection type.
 * @param reason - Foreign callback failure.
 * @returns Native Error or a safe Error retaining its cause.
 */
export function devWatchError<Reason>(reason: Reason): Error {
  return reason instanceof Error
    ? reason
    : new Error("Native source watcher failed", { cause: reason });
}

/**
 * Closes one registration and retains secondary native failures for joined cleanup.
 * @param state - Invocation-owned failure receipt.
 * @param stop - Exact registration stop.
 * @returns No value.
 */
export function stopWatchRegistration(state: DevWatchState, stop: () => void): void {
  try {
    stop();
  } catch (reason) {
    MutableRef.update(state.releaseFailures.ref, (previous) => [
      ...previous,
      devWatchError(reason),
    ]);
  }
}

/**
 * Builds native admission callbacks over state owned by the dev session's Scope.
 * @param session - Native session shutdown authority.
 * @param state - This watch owner's mutable admission and failure state.
 * @returns Synchronous callbacks without hidden effect execution.
 */
export function devWatchCallbacks(session: DevSession, state: DevWatchState): DevWatchCallbacks {
  return {
    notify: (files) => {
      if (Ref.getUnsafe(state.open)) Queue.offerUnsafe(state.events, files);
    },
    failure: (reason) => {
      if (!Ref.getUnsafe(state.open) || Ref.getUnsafe(state.nativeFailures).length) return;
      const error = devWatchError(reason);
      MutableRef.set(state.nativeFailures.ref, [error]);
      session.nativeEngine.requestStop(error);
    },
    close: () => {
      if (!Ref.getUnsafe(state.open)) return;
      MutableRef.set(state.open.ref, false);
      for (const stop of state.stops) stopWatchRegistration(state, stop);
      Queue.shutdownUnsafe(state.events);
    },
  };
}

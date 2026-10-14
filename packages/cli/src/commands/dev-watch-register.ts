/** Registers native watch stops exactly once, including acquisitions that settle during close. */
import { Effect, Ref } from "effect";
import { stopWatchRegistration } from "./dev-watch-callbacks.js";
import type { DevWatchOwner, DevWatchState } from "./dev-watch-owner.types.js";

/**
 * Constructs registration over one owner without admitting work after shutdown.
 * @param state - Invocation-owned native stop/failure state.
 * @returns Lazy registrar; each returned stop is idempotent and acquisition is masked until owned.
 */
export function devWatchRegistrar(state: DevWatchState): DevWatchOwner["register"] {
  return (acquisition) =>
    acquisition.pipe(
      Effect.map((nativeStop) => {
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          nativeStop();
        };
      }),
      Effect.tap((stop) =>
        Effect.sync(() => {
          if (Ref.getUnsafe(state.open)) state.stops.push(stop);
          else stopWatchRegistration(state, stop);
        }),
      ),
      Effect.uninterruptible,
    );
}

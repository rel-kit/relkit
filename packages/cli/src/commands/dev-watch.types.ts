import type { Effect } from "effect";

/** Existing synchronous watcher admission boundary. */
export interface DevSourceWatcher {
  /**
   * Stops native file admission immediately; the session Scope still joins owned work.
   * @returns No value; release failures remain in the scoped cleanup receipt.
   */
  readonly close: () => void;
}
/** Native watcher owner used by command composition. */
export interface EffectDevSourceWatcher extends DevSourceWatcher {
  /** Joins every watcher release and the debounced worker before returning. */
  readonly closeEffect: Effect.Effect<void>;
}

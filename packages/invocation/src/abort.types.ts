import type { Effect } from "effect";

/** Public link from a fiber signal to a handler-visible abort signal.
 * Dispose removes listeners; calling it again has no effect.
 * @example const bridge = createAbortBridge(fiberSignal, parentSignal);
 */
export interface AbortBridge {
  readonly signal: AbortSignal;
  /** Removes linked abort listeners.
   * @returns Void; repeated calls are safe.
   * @example bridge.dispose();
   */
  readonly dispose: () => void;
}

/** Abort bridge with direct Effect cleanup for scoped callers.
 * Use disposeEffect when cleanup belongs in an Effect finalizer.
 * @example yield* bridge.disposeEffect();
 */
export interface AbortBridgeEffectHandle extends AbortBridge {
  /** Removes linked listeners through Effect.
   * @returns An Effect with no expected failure.
   * @example yield* bridge.disposeEffect();
   */
  readonly disposeEffect: () => Effect.Effect<void>;
}

/** Injectable controller and listener operations for abort propagation.
 * The listener returns its removal callback for scoped release.
 * @example const layer = Layer.succeed(AbortIO, { createController, listen });
 */
export interface AbortIOService {
  /** Creates a linked signal controller.
   * @returns A fresh controller.
   * @example io.createController();
   */
  readonly createController: () => AbortController;
  /** Registers one abort listener.
   * @param signal - Source signal.
   * @param onAbort - Callback invoked on cancellation.
   * @returns A callback that removes the listener.
   * @example const remove = io.listen(signal, onAbort);
   */
  readonly listen: (signal: AbortSignal, onAbort: () => void) => () => void;
}

export type { MaybePromise } from "@relkit/contracts";
export type { InvocationContextOptions, InvocationRecord, PublicClock } from "./contracts.js";
import type { Effect } from "effect";

/** Linked signals with explicit Effect cleanup and a synchronous adapter.
 * Unlink is idempotent and removes all registered abort listeners.
 * @example const link = Effect.runSync(linkSignalsEffect(controller, [parentSignal]));
 */
export interface SignalLinkHandle {
  /** Removes linked signal listeners.
   * @returns Void; repeated calls are safe.
   * @example handle.unlink();
   */
  readonly unlink: () => void;
  /** Removes listeners through Effect.
   * @returns Void with no expected failure.
   * @example Effect.runSync(handle.unlinkEffect());
   */
  readonly unlinkEffect: () => Effect.Effect<void>;
}

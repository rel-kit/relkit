/** Invocation-owned watch admission, failure receipts and joined worker lifetime. */
import type { Effect, Queue, Ref, Scope } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { EffectDevSourceWatcher } from "./dev-watch.types.js";

export interface DevWatchState {
  readonly events: Queue.Queue<readonly string[]>;
  readonly nativeFailures: Ref.Ref<readonly Error[]>;
  readonly releaseFailures: Ref.Ref<readonly Error[]>;
  readonly open: Ref.Ref<boolean>;
  readonly scope: Scope.Closeable;
  readonly stops: Array<() => void>;
  readonly configStops: Map<string, () => void>;
  readonly configPaths: Set<string>;
}
export interface DevWatchCallbacks {
  /** @param files - Bounded changed-file batch. @returns No value; only enqueues admission. */
  readonly notify: (files: readonly string[]) => void;
  /** @param reason - Native failure. @returns No value; requests supervised shutdown. */
  readonly failure: <Reason>(reason: Reason) => void;
  /** @returns No value after native admission and every existing registration close. */
  readonly close: () => void;
}
export interface DevWatchOwner extends EffectDevSourceWatcher, DevWatchCallbacks {
  readonly state: DevWatchState;
  /**
   * Registers each native stop before interruption can release its owner.
   * @param acquisition - Native listener acquisition.
   * @returns The stop registered with this owner.
   */
  readonly register: (
    acquisition: Effect.Effect<() => void, CliAdapterError>,
  ) => Effect.Effect<() => void, CliAdapterError>;
}

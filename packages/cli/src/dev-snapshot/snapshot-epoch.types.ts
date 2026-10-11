/**
 * Describes one scoped source/dependency watch epoch. Tokens belong to one watch
 * session and cannot be reused across roots or restarts; native watch errors
 * invalidate authority rather than silently certifying unobserved work.
 */
import type { Effect, Scope, Queue } from "effect";
import type { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";
import type { SnapshotEpochPreflight } from "./snapshot-preflight.types.js";

/** Ephemeral identity is never serialized into a portable snapshot. */
export interface SnapshotEpochToken {
  readonly owner: symbol;
  readonly revision: number;
}

/** A watch remains owned until preparation or the dev session Scope closes. */
export interface SnapshotEpoch {
  readonly current: Effect.Effect<SnapshotEpochToken, DevSnapshotIoError>;
  readonly verify: (
    token: SnapshotEpochToken,
  ) => Effect.Effect<void, DevSnapshotIoError | DevSnapshotRejected>;
  /** Coalesces relevant changes without losing the latest monotonic epoch revision. */
  readonly changed: Effect.Effect<SnapshotEpochToken, DevSnapshotIoError>;
  /**
   * Reads the watch witness synchronously in the supervisor's atomic switch turn.
   * @param token - Token belonging to this still-owned native watch.
   * @returns True only when token provenance, revision and watch health still match.
   */
  readonly isCurrent: (token: SnapshotEpochToken) => boolean;
}

/** Native callback state contains identities and safe errors, never source or environment bytes. */
export interface SnapshotEpochState {
  readonly owner: symbol;
  revision: number;
  failure: DevSnapshotIoError | undefined;
  readonly events: Queue.Queue<Effect.Effect<SnapshotEpochToken, DevSnapshotIoError>>;
}

/** Acquisition starts observation before any reusable bytes are read. */
export interface SnapshotEpochOperations {
  readonly begin: (
    root: string,
    preflight?: SnapshotEpochPreflight,
  ) => Effect.Effect<SnapshotEpoch, DevSnapshotIoError, Scope.Scope>;
}

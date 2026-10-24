/** Composes preflight byte proof with the snapshot epoch without acquiring or executing another evaluator. */
import { Effect } from "effect";
import { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";
import type { SnapshotCommandPreflight } from "./snapshot-preflight.types.js";
import type { SnapshotEpoch, SnapshotEpochToken } from "./snapshot-epoch.types.js";
import type { SnapshotCurrentMemberProof } from "./snapshot.types.js";

/** Reuses a preflight only when its source epoch matches the session's observed token. */
export function snapshotCurrentMemberProof(
  matching: SnapshotCommandPreflight | undefined,
  token: SnapshotEpochToken,
  epoch: SnapshotEpoch,
): SnapshotCurrentMemberProof | undefined {
  if (matching === undefined || matching.startRevision !== token.revision) return undefined;
  return {
    generation: matching.generation,
    verification: Effect.tryPromise({
      try: () => matching.mismatch,
      catch: (cause) =>
        new DevSnapshotIoError({
          operation: "members.preflight",
          cause: new Error("Snapshot integrity preflight failed", { cause }),
        }),
    }).pipe(
      Effect.flatMap((mismatch) =>
        mismatch === undefined
          ? Effect.void
          : Effect.fail(
              new DevSnapshotRejected({ reason: "stale", operation: "members.preflight" }),
            ),
      ),
      Effect.andThen(epoch.verify(token)),
    ),
  };
}

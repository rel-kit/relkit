/**
 * Tracks source and installed dependency revisions across byte validation and
 * activation. Tokens belong to one scoped watch; errors or closure invalidate
 * authority. Native callbacks only update witnesses and bounded event admission.
 */
import { Context, Effect, Layer, Queue } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { DevSnapshotRejected, type DevSnapshotIoError } from "./snapshot-error.js";
import { acquireSnapshotEpochWatch } from "./snapshot-epoch-watch.js";
import type {
  SnapshotEpoch,
  SnapshotEpochOperations,
  SnapshotEpochState,
  SnapshotEpochToken,
} from "./snapshot-epoch.types.js";

/** Acquires no native watch until begin runs within the caller Scope. */
export class SnapshotEpochs extends Context.Service<SnapshotEpochs, SnapshotEpochOperations>()(
  "relkit/DevSnapshot/Epochs",
  {
    make: Effect.sync(() => ({ begin: beginEpoch }) satisfies SnapshotEpochOperations),
  },
) {}

/** Native epochs and deterministic test substitutes implement the same contract. */
export const snapshotEpochsLive = Layer.effect(SnapshotEpochs, SnapshotEpochs.make);

/**
 * Starts complete input observation before returning token authority.
 * @param root - Current installed project root.
 * @returns Request-owned epoch; Scope release invalidates tokens and closes observation.
 */
const beginEpoch = Effect.fn("DevSnapshot.beginEpoch")(function* (
  root: string,
  preflight?: import("./snapshot-preflight.types.js").SnapshotEpochPreflight,
) {
  const state: SnapshotEpochState = {
    owner: Symbol("snapshot-epoch"),
    revision: 0,
    failure: undefined,
    events: yield* Queue.make<Effect.Effect<SnapshotEpochToken, DevSnapshotIoError>>({
      capacity: 1,
      strategy: "sliding",
    }),
  };
  yield* acquireSnapshotEpochWatch(root, state, preflight);
  const current = Effect.suspend(() =>
    state.failure === undefined
      ? Effect.succeed({ owner: state.owner, revision: state.revision })
      : Effect.fail(state.failure),
  );
  return {
    current,
    changed: Queue.take(state.events).pipe(Effect.flatMap((event) => event)),
    isCurrent: (token) =>
      state.failure === undefined &&
      token.owner === state.owner &&
      token.revision === state.revision,
    verify: (token) => observeExecution("cli", "dev.snapshot.epoch", verifyEpoch(current, token)),
  } satisfies SnapshotEpoch;
});

/**
 * Preserves watch errors and rejects a token from an obsolete or different watch.
 * @param current - Lazy current witness, invalid after native failure or closure.
 * @param token - Token established before complete input-byte validation.
 * @returns Completion or expected stale/watch rejection without changing other channels.
 */
function verifyEpoch(current: SnapshotEpoch["current"], token: SnapshotEpochToken) {
  return current.pipe(
    Effect.flatMap((actual) =>
      token.owner === actual.owner && token.revision === actual.revision
        ? Effect.void
        : Effect.fail(new DevSnapshotRejected({ reason: "stale", operation: "epoch.changed" })),
    ),
  );
}

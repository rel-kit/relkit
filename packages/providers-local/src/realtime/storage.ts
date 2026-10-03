import type { RealtimeStateStore, RealtimeStateStoreEffects } from "./storage.types.js";
import { Effect, Schema } from "effect";
import { makeLocalStateStore } from "../state-store.service.js";
import { runLocal, runLocalSync } from "../local-effect.js";
import { emptyRealtimeState, type LocalRealtimeState } from "./state.js";
import { RealtimeState } from "./state.schemas.js";
import { LocalRealtimeError } from "./common.js";

export type { RealtimeStateStore, RealtimeStateStoreEffects } from "./storage.types.js";

/**
 * Creates a lazy Effect store with the established snapshot and lock names.
 * @param root - Owned directory containing realtime state.
 * @returns The effect that constructs shared storage operations.
 */
export function makeRealtimeStateStore(root: string) {
  return Effect.gen(function* () {
    const store = yield* makeLocalStateStore({
      root,
      filename: "realtime.json",
      lockname: ".realtime.lock",
      empty: emptyRealtimeState,
      decode: decodeState,
      prune: pruneReceipts,
      isExpectedFailure: (cause) =>
        cause instanceof LocalRealtimeError ||
        (cause instanceof Error &&
          ["Presence lease does not exist.", "PRESENCE_CAPACITY_EXCEEDED"].includes(cause.message)),
    });
    return {
      read: store.read,
      update: <Value>(
        change: (state: LocalRealtimeState) => {
          readonly state: LocalRealtimeState;
          readonly value: Value;
        },
      ) =>
        store.update((state) => {
          const next = change(state);
          return [next.state, next.value] as const;
        }),
    } satisfies RealtimeStateStoreEffects;
  });
}

/**
 * Exposes the Promise transaction contract at an external adapter boundary.
 * @param root - Owned state directory.
 * @returns The lazily initialized store.
 */
export function createRealtimeStateStore(root: string): RealtimeStateStore {
  const store = runLocalSync(makeRealtimeStateStore(root));
  return { read: () => runLocal(store.read()), update: (change) => runLocal(store.update(change)) };
}

/**
 * Validates the stored format before domain operations inspect records.
 * @param value - Parsed snapshot.
 * @returns The current version's state.
 */
function decodeState(value: unknown): LocalRealtimeState {
  if (Schema.is(RealtimeState)(value)) return value;
  return Schema.decodeUnknownSync(RealtimeState)(value);
}

/**
 * Removes expired receipts without changing retained event state.
 * @param state - Committed snapshot.
 * @param now - Clock time in milliseconds.
 * @returns The snapshot with active receipts.
 */
function pruneReceipts(state: LocalRealtimeState, now: number): LocalRealtimeState {
  return {
    ...state,
    receipts: Object.fromEntries(
      Object.entries(state.receipts).filter(([, receipt]) => Date.parse(receipt.expiresAt) > now),
    ),
  };
}

import type { AgentStateStore, AgentStateStoreEffects } from "./storage.types.js";
import { Schema } from "effect";
import { makeLocalStateStore } from "../state-store.service.js";
import { runLocal, runLocalSync } from "../local-effect.js";
import { emptyAgentState, type LocalAgentState, type StoredReceipt } from "./state.js";
import { AgentState } from "./state.schemas.js";
import { LocalAgentStateError } from "./common.js";

export type { AgentStateStore, AgentStateStoreEffects } from "./storage.types.js";

/**
 * Creates the lazy filesystem store for one agent-state root.
 * @param root - Owned state directory.
 * @returns A synchronous construction effect; IO starts with the first operation.
 */
export function makeAgentStateStore(root: string) {
  return makeLocalStateStore({
    root,
    filename: "agent-state.json",
    lockname: ".agent-state.lock",
    empty: emptyAgentState,
    decode: decodeState,
    prune: pruneReceipts,
    isExpectedFailure: (cause) => cause instanceof LocalAgentStateError,
  });
}

/**
 * Creates a compatible Promise store using the Effect transaction owner.
 * @param root - Owned state directory.
 * @returns A store with shared initialization and atomic updates.
 */
export function createAgentStateStore(root: string): AgentStateStore {
  const store = runLocalSync(makeAgentStateStore(root));
  return { read: () => runLocal(store.read()), update: (change) => runLocal(store.update(change)) };
}

/**
 * Validates persisted format identity before domain operations inspect records.
 * @param value - Untrusted parsed snapshot.
 * @returns The existing state representation after format validation.
 */
function decodeState(value: unknown): LocalAgentState {
  if (Schema.is(AgentState)(value)) return value;
  return Schema.decodeUnknownSync(AgentState)(value);
}

/**
 * Expires receipts using the store's injected Clock.
 * @param state - Current committed state.
 * @param now - Current time in milliseconds.
 * @returns A snapshot containing only active receipts.
 */
function pruneReceipts(state: LocalAgentState, now: number): LocalAgentState {
  return {
    ...state,
    runReceipts: liveReceipts(state.runReceipts, now),
    controlReceipts: liveReceipts(state.controlReceipts, now),
    continuationReceipts: liveReceipts(state.continuationReceipts, now),
  };
}

/**
 * Selects receipts within their persisted expiry window.
 * @param receipts - Receipt index.
 * @param now - Current time in milliseconds.
 * @returns The retained index.
 * @typeParam Value - Receipt payload.
 */
function liveReceipts<Value>(
  receipts: Readonly<Record<string, StoredReceipt<Value>>>,
  now: number,
): Readonly<Record<string, StoredReceipt<Value>>> {
  return Object.fromEntries(
    Object.entries(receipts).filter(([, receipt]) => Date.parse(receipt.expiresAt) > now),
  );
}

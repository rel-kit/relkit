import type {
  AgentState,
  AgentRun,
  AgentThread,
  AgentControl,
  PinnedSnapshot,
} from "./state.schemas.js";

/** Generic idempotency envelope used when selecting retained receipts.
 * @typeParam Value - Domain receipt payload.
 */
export interface StoredReceipt<Value> {
  readonly semanticDigest: string;
  readonly expiresAt: string;
  readonly value: Value;
}

/** Complete validated version-one agent-state snapshot. */
export type LocalAgentState = typeof AgentState.Type;

/** Run metadata and journal limits decoded together. */
export type LocalStoredRun = typeof AgentRun.Type;

/** Thread, runs, controls and retained content decoded before transitions. */
export type LocalAgentThread = typeof AgentThread.Type;

/** Control record with its receipt and downstream identity. */
export type LocalControl = typeof AgentControl.Type;

/** Immutable pinned message view retained for paginated history. */
export type LocalPinnedSnapshot = typeof PinnedSnapshot.Type;

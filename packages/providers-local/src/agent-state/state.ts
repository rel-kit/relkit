import type {
  StoredReceipt,
  LocalControl,
  LocalAgentThread,
  LocalPinnedSnapshot,
  LocalStoredRun,
  LocalAgentState,
} from "./state.types.js";
export type {
  StoredReceipt,
  LocalControl,
  LocalAgentThread,
  LocalPinnedSnapshot,
  LocalStoredRun,
  LocalAgentState,
} from "./state.types.js";

export const LOCAL_AGENT_STATE_VERSION = 1;

/**
 * Creates format-v1 state with a fresh provider epoch and empty domain indexes.
 * @returns An empty format-v1 agent snapshot with a new epoch.
 */
export function emptyAgentState(): LocalAgentState {
  return {
    version: LOCAL_AGENT_STATE_VERSION,
    providerEpoch: crypto.randomUUID(),
    revision: 0,
    threads: {},
    createReceipts: {},
    runReceipts: {},
    controlReceipts: {},
    continuationReceipts: {},
  };
}

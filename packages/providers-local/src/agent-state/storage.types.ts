import type { LocalStateStore } from "../state-store.types.js";
import type { LocalAgentState } from "./state.js";

/** Promise storage seam retained for existing provider adapters and fault injection. */
export interface AgentStateStore {
  read(): Promise<LocalAgentState>;
  update<Value>(
    change: (state: LocalAgentState) => readonly [LocalAgentState, Value],
  ): Promise<Value>;
}

/** Effect storage contract used by agent-state operations. */
export type AgentStateStoreEffects = LocalStateStore<LocalAgentState>;

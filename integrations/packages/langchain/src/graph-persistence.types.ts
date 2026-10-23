/** Acquires native graph checkpointer and store configuration for invocation and supplies the release action to the owning graph scope. This companion preserves the native input and output types without starting runtime work. */

import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import type { PersistenceResource } from "./define-persistence.js";

/** Resolved handles passed to a compiled graph. */
export interface ResolvedGraphPersistence {
  readonly checkpointer?: BaseCheckpointSaver;
  readonly store?: BaseStore;
}

/** Optional checkpointer and store declarations on an agent. */
export interface AgentPersistenceDeclaration {
  readonly checkpointer?: unknown;
  readonly store?: unknown;
}

/** A persistence descriptor being resolved for one invocation. */
export type AnyPersistenceResource = PersistenceResource<"checkpointer" | "memory", unknown>;

/** Pending and committed resolution state for one shared resource. */
export interface ResolutionState {
  pending: number;
  committed: boolean;
}

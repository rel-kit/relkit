import type { Effect } from "effect";
import type { GenerationLifecycleError } from "./lifecycle.js";

/** Generation lifecycle states in transition order. */
export type GenerationLifecycleState =
  "constructing" | "ready" | "draining" | "shutting-down" | "shutdown";

/** Compatibility alias for a generation state. */
export type GenerationState = GenerationLifecycleState;

/** Immutable state observed by admission and shutdown. */
export interface GenerationLifecycleSnapshot {
  readonly state: GenerationLifecycleState;
  readonly activeCount: number;
  readonly accepting: boolean;
}

/** Exactly-once release of admitted generation work. */
export interface GenerationLease {
  readonly release: () => void;
}

/** Lifecycle operations shared by live and deterministic test layers. */
export interface GenerationOperations {
  readonly snapshot: () => Effect.Effect<GenerationLifecycleSnapshot>;
  readonly markReady: () => Effect.Effect<void, GenerationLifecycleError>;
  readonly beginDrain: () => Effect.Effect<void, GenerationLifecycleError>;
  readonly beginShutdown: () => Effect.Effect<void, GenerationLifecycleError>;
  readonly completeShutdown: () => Effect.Effect<void, GenerationLifecycleError>;
  readonly acquire: () => Effect.Effect<GenerationLease, GenerationLifecycleError>;
  readonly waitForIdle: () => Effect.Effect<void>;
}

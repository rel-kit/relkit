import type { Effect } from "effect";
import type { LocalOperationError } from "../local-effect.js";
import type { LocalRealtimeState } from "./state.js";

/** Existing Promise transaction seam for third-party storage adapters. */
export interface RealtimeStateStore {
  readonly read: () => Promise<LocalRealtimeState>;
  readonly update: <Value>(
    change: (state: LocalRealtimeState) => {
      readonly state: LocalRealtimeState;
      readonly value: Value;
    },
  ) => Promise<Value>;
}

/** Effect operations sharing one transactional initialization and lock owner. */
export interface RealtimeStateStoreEffects {
  readonly read: () => Effect.Effect<LocalRealtimeState, LocalOperationError>;
  readonly update: <Value>(
    change: (state: LocalRealtimeState) => {
      readonly state: LocalRealtimeState;
      readonly value: Value;
    },
  ) => Effect.Effect<Value, LocalOperationError>;
}

import type { Effect } from "effect";
import type { LocalOperationError } from "./local-effect.js";

/** Atomic snapshot storage shared by filesystem-backed local domains. */
export interface LocalStateStore<State> {
  readonly read: () => Effect.Effect<State, LocalOperationError>;
  readonly update: <A>(
    change: (state: State) => readonly [State, A],
  ) => Effect.Effect<A, LocalOperationError>;
}

/** Domain-specific decoding and pruning without changing the on-disk format. */
export interface LocalStateStoreOptions<State> {
  readonly root: string;
  readonly filename: string;
  readonly lockname: string;
  readonly decode: (value: unknown) => State;
  readonly empty: () => State;
  readonly prune: (state: State, now: number) => State;
  readonly isExpectedFailure: (cause: unknown) => boolean;
}

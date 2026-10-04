import type { Deferred, Effect, Ref } from "effect";
import type { SupervisorCandidateToken } from "./state-machine.types.js";
import type {
  SupervisorDrainLease,
  SupervisorDrainReport,
  SupervisorDrainWorkOptions,
} from "./drain.types.js";

/** Native cancellation capability associated with one retained generation lease. */
export interface TrackedWork {
  readonly controller: AbortController;
  readonly interrupt: SupervisorDrainWorkOptions["interrupt"];
}

/** Atomic admission map and Deferred idle synchronization; acknowledgments remain authoritative after reporting. */
export interface DrainState {
  readonly work: ReadonlyMap<number, TrackedWork>;
  readonly nextId: number;
  readonly accepting: boolean;
  readonly idle: Deferred.Deferred<void>;
}

/** Replaceable scoped shutdown workflow with synchronous lease admission. */
export interface DrainService {
  /** Counts authoritative, unacknowledged leases. @returns The current retained count. */
  readonly inFlight: Effect.Effect<number>;
  /** Reads admission state. @returns Whether a new generation lease can be tracked. */
  readonly accepting: Effect.Effect<boolean>;
  /** Acquires one generation lease. @param token - Generation witness. @param options - Native cancellation callback.
   * @returns An idempotently releasable lease or no admission after drain begins. */
  readonly track: (
    token: SupervisorCandidateToken,
    options: SupervisorDrainWorkOptions,
  ) => Effect.Effect<SupervisorDrainLease | undefined>;
  /** Shares bounded generation shutdown. @returns Immutable cleanup evidence without fabricating native settlement. */
  readonly drain: Effect.Effect<SupervisorDrainReport>;
}

/** Owned drain state and injected clock defining one absolute deadline. */
export interface DrainRunOptions {
  readonly state: Ref.Ref<DrainState>;
  readonly now: Effect.Effect<number>;
  readonly deadlineMs: number;
  readonly token: SupervisorCandidateToken;
}

import type { Effect } from "effect";
import type {
  SupervisorCandidateToken,
  SupervisorCandidatePhase,
  SupervisorOutcomeName,
  SupervisorStateSnapshot,
  SupervisorTelemetry,
  SupervisorTelemetryListener,
} from "./state-machine.types.js";
import type { ActivationTransitionError } from "./state-machine.schemas.js";

/** Lifecycle records receive their sequence only when the transaction commits. */
export type ActivationRecord =
  | Omit<Extract<SupervisorTelemetry, { readonly type: "transition" }>, "sequence">
  | Omit<Extract<SupervisorTelemetry, { readonly type: "outcome" }>, "sequence">;

/** Pure transaction result committed atomically before listener delivery. @typeParam A - Committed public operation result. */
export interface ActivationTransition<A> {
  readonly value: A;
  readonly snapshot: SupervisorStateSnapshot;
  readonly records: readonly ActivationRecord[];
}

/** Replaceable activation workflow; all state decisions complete synchronously. */
export interface ActivationService {
  /** Reads immutable lifecycle state. @returns The current public snapshot. */
  readonly snapshot: Effect.Effect<SupervisorStateSnapshot>;
  /** Reads retained lifecycle evidence. @returns A copy of committed records. */
  readonly telemetry: Effect.Effect<readonly SupervisorTelemetry[]>;
  /** Starts a candidate. @returns Its monotonically increasing identity. */
  readonly sourceChanged: () => Effect.Effect<SupervisorCandidateToken, ActivationTransitionError>;
  /** Completes a candidate phase. @param phase - Owned phase. @param token - Candidate identity.
   * @param success - Whether the phase succeeded. @param reason - Existing failure detail.
   * @returns Whether this candidate still owns the phase.
   */
  readonly complete: (
    phase: SupervisorCandidatePhase | "switch",
    token: SupervisorCandidateToken,
    success: boolean,
    reason?: unknown,
  ) => Effect.Effect<boolean, ActivationTransitionError | TypeError>;
  /** Activates a verified candidate atomically. @param token - Verified identity.
   * @returns Whether activation still belongs to this candidate.
   */
  readonly activate: (
    token: SupervisorCandidateToken,
  ) => Effect.Effect<boolean, ActivationTransitionError | TypeError>;
  /** Completes retired-generation drain. @param token - Active identity.
   * @param outcome - Existing bounded drain outcome. @param reason - Existing failure detail.
   * @returns Whether the active generation still owns this drain.
   */
  readonly drained: (
    token: SupervisorCandidateToken,
    outcome: SupervisorOutcomeName,
    reason?: unknown,
  ) => Effect.Effect<boolean, ActivationTransitionError | TypeError>;
  /** Registers a native synchronous observer. @param listener - Evidence consumer.
   * @returns Nothing; unregister with unsubscribe.
   */
  readonly subscribe: (listener: SupervisorTelemetryListener) => Effect.Effect<void>;
  /** Releases a native synchronous observer. @param listener - Previously registered consumer.
   * @returns Nothing; repeated release is harmless.
   */
  readonly unsubscribe: (listener: SupervisorTelemetryListener) => Effect.Effect<void>;
}

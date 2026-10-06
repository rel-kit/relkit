import type { Effect } from "effect";
import type {
  CandidateOptions,
  CandidateVerificationOptions,
  StartedCandidate,
  SupervisorGenerationDrain,
  SupervisorProxy,
} from "@relkit/supervisor";
import type { CliAdapterError } from "../cli-errors.js";

/** Native supervisor boundaries; the SDK retains ownership of its private runtimes. */
export interface DevSupervisorOperations {
  /** Starts an unpublished candidate with explicitly owned compilation and process resources.
   * @param options - One candidate's explicit compilation and signal policy.
   * @returns An owned candidate without publishing traffic.
   */
  readonly start: (options: CandidateOptions) => Effect.Effect<StartedCandidate, CliAdapterError>;
  /** Verifies candidate readiness against the complete expected activation identity.
   * @param options - Candidate and full expected activation identity.
   * @returns Successful readiness verification.
   */
  readonly verify: (options: CandidateVerificationOptions) => Effect.Effect<void, CliAdapterError>;
  /** Closes an unpublished or retired SDK candidate and joins its physical cleanup.
   * @param candidate - Candidate whose SDK owner must be closed.
   * @returns Joined process/directory cleanup.
   */
  readonly dispose: (candidate: StartedCandidate) => Effect.Effect<void, CliAdapterError>;
  /** Joins an owned generation drain through its bounded terminal outcome.
   * @param drain - Existing generation drain owner.
   * @returns Its bounded terminal outcome.
   */
  readonly drain: (
    drain: SupervisorGenerationDrain,
  ) => Effect.Effect<Awaited<ReturnType<SupervisorGenerationDrain["drain"]>>, CliAdapterError>;
  /** Acquires the stable proxy listener without racing its physical stop.
   * @param proxy - Stable listener owned by the session.
   * @returns Listening readiness.
   */
  readonly listen: (proxy: SupervisorProxy) => Effect.Effect<void, CliAdapterError>;
  /** Stops the stable proxy after pending native listener acquisition has settled.
   * @param proxy - Stable listener owned by the session.
   * @returns Joined in-flight request cleanup.
   */
  readonly stopProxy: (proxy: SupervisorProxy) => Effect.Effect<void, CliAdapterError>;
}

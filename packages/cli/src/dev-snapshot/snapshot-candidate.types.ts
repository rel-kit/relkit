/** Runtime-neutral candidate installation/probe contracts consume one validated receipt. */
import type { Effect } from "effect";
import type {
  CandidateCompileRequest,
  CandidateCompileResult,
  StartedCandidate,
} from "@relkit/supervisor";
import type { CliAdapterError } from "../cli-errors.js";
import type { ValidatedDevSnapshot } from "./snapshot.types.js";
import type { SnapshotEpoch, SnapshotEpochToken } from "./snapshot-epoch.types.js";

/** Owned output writes belong to the supervisor's freshly acquired generation directory. */
export interface SnapshotCandidateFileOperations {
  readonly write: (
    directory: string,
    path: string,
    bytes: Uint8Array,
  ) => Effect.Effect<void, CliAdapterError>;
}

/** Bounded route response after all body bytes have been received and decoded. */
export interface SnapshotProbeResponse {
  readonly status: number;
  readonly body: string;
  /** Reconstructed complete response retained only for request-assisted activation. */
  readonly response?: Response;
}

/** Explicit native HTTP authority, independently substitutable in shared contract tests. */
export interface SnapshotProbeOperations {
  readonly read: (
    port: number,
    path: string,
    signal: AbortSignal,
  ) => Effect.Effect<SnapshotProbeResponse, CliAdapterError>;
  readonly forward: (
    port: number,
    request: Request,
    signal: AbortSignal,
  ) => Effect.Effect<SnapshotProbeResponse, CliAdapterError>;
}

/** The epoch remains watched from before validation until the generation switches. */
export interface SnapshotCandidateRequest {
  readonly snapshot: ValidatedDevSnapshot;
  readonly epoch: SnapshotEpoch;
  readonly token: SnapshotEpochToken;
  readonly projectRoot: string;
  readonly candidate: CandidateCompileRequest;
}

/** Backend readiness requires complete cohort verification plus a real route response. */
export interface SnapshotCandidateOperations {
  readonly install: (
    request: SnapshotCandidateRequest,
  ) => Effect.Effect<CandidateCompileResult, CliAdapterError>;
  readonly probe: (
    request: SnapshotCandidateRequest,
    child: StartedCandidate,
    signal: AbortSignal,
    publicRequest?: Request,
  ) => Effect.Effect<SnapshotProbeResponse, CliAdapterError>;
}

/** Compiler handoff consumes one validated immutable cohort and a still-owned input epoch. */
import type { Effect, Scope } from "effect";
import type { CandidateCompile, StartedCandidate } from "@relkit/supervisor";
import type { RuntimeActivationFingerprint } from "@relkit/contracts";
import type { CliAdapterError } from "../cli-errors.js";
import type { DevCompilerOptions } from "../commands/dev-local.types.js";
import type { ValidatedDevSnapshot } from "./snapshot.types.js";
import type { SnapshotEpoch, SnapshotEpochToken } from "./snapshot-epoch.types.js";
import type { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";

/** Prepared callbacks participate in the existing supervisor; edits use its safe compiler. */
export interface SnapshotSessionCompiler {
  readonly compile: CandidateCompile;
  readonly fingerprint: (candidate: StartedCandidate) => RuntimeActivationFingerprint | undefined;
  readonly admission: (candidate: StartedCandidate) => boolean;
  readonly verify: (
    candidate: StartedCandidate,
    signal: AbortSignal,
  ) => Effect.Effect<void, CliAdapterError>;
  readonly intercept: (request: Request) => Promise<Response> | undefined;
  readonly publish: (candidate: StartedCandidate) => void;
  readonly reject: (candidate: StartedCandidate) => void;
}

/** Policy is borrowed; its worker, lazy fallback and installed candidates remain session-owned. */
export interface SnapshotSessionCompilerRequest {
  readonly options: DevCompilerOptions;
  readonly snapshot: ValidatedDevSnapshot;
  readonly epoch: SnapshotEpoch;
  readonly token: SnapshotEpochToken;
  readonly verification: Effect.Effect<void, DevSnapshotRejected | DevSnapshotIoError>;
}

/** Shared candidate and fallback authorities are captured in the service's make. */
export interface SnapshotSessionCompilerOperations {
  readonly acquire: (
    request: SnapshotSessionCompilerRequest,
  ) => Effect.Effect<SnapshotSessionCompiler, CliAdapterError, Scope.Scope>;
}

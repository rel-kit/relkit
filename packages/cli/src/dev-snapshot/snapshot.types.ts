/**
 * Shares schema-derived receipt values between preparation, validation and runtime
 * adapters. A decoded receipt is data only; the immutable validated result is
 * returned by the service after all input, artifact and cohort checks succeed.
 */
import type { Schema } from "effect";
import type { Effect, Scope } from "effect";
import type { ApplicationGraph } from "@relkit/graph";
import type { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";
import type {
  DevSnapshot as SnapshotSchema,
  SnapshotMember as MemberSchema,
  SnapshotTools as ToolsSchema,
  SnapshotDependency as DependencySchema,
} from "./snapshot.schemas.js";

/** Persisted portable receipt accepted by the shared decoder. */
export interface DevSnapshot extends Schema.Schema.Type<typeof SnapshotSchema> {}

/** Complete bytes belonging to one input or runnable artifact. */
export interface SnapshotMember extends Schema.Schema.Type<typeof MemberSchema> {}

/** Exact tool versions and supported host identity for reuse. */
export interface SnapshotTools extends Schema.Schema.Type<typeof ToolsSchema> {}

/** Complete executable package content used while preparing the immutable bundle. */
export interface SnapshotDependency extends Schema.Schema.Type<typeof DependencySchema> {}

/** Exact accepted bytes represented by an immutable string, never a shared mutable buffer. */
export interface SnapshotSealedArtifact extends SnapshotMember {
  /** Base64 of the actual hashed bytes, retained only in the acquired session's memory. */
  readonly content: string;
}

/** One verified cohort consumed by candidate execution and supervisor activation. */
export interface ValidatedDevSnapshot {
  readonly receipt: DevSnapshot;
  readonly graph: ApplicationGraph;
  /** Complete sealed content reused by cohort checks and candidate installation. */
  readonly artifacts: readonly SnapshotSealedArtifact[];
  /** Current physical capsule location computed after relocation, never persisted. */
  readonly capsuleRoot: string;
  /** Receipt content address verified against the current pointer. */
  readonly generation: string;
}

/** Immutable executable cohort whose mutable-current verification is already running. */
export interface StagedDevSnapshot {
  readonly snapshot: ValidatedDevSnapshot;
  readonly verification: Effect.Effect<void, DevSnapshotRejected | DevSnapshotIoError>;
}

/** Early member proof tied to one content-addressed receipt generation. */
export interface SnapshotCurrentMemberProof {
  readonly generation: string;
  readonly verification: Effect.Effect<void, DevSnapshotRejected | DevSnapshotIoError>;
}

/** Validation borrows filesystem authority captured once by the service's Layer. */
export interface DevSnapshotOperations {
  readonly stage: (
    root: string,
    tools: SnapshotTools,
    currentMembers?: SnapshotCurrentMemberProof,
  ) => Effect.Effect<StagedDevSnapshot, DevSnapshotRejected | DevSnapshotIoError, Scope.Scope>;
  readonly validate: (
    root: string,
    tools: SnapshotTools,
  ) => Effect.Effect<ValidatedDevSnapshot, DevSnapshotRejected | DevSnapshotIoError>;
}

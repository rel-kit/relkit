/**
 * Defines publication authority and its owned stage contract. Logical receipt
 * paths stay separate from private native staging paths; publication guards are
 * rerun before switching the pointer and preserve typed epoch rejection.
 */
import type { Effect, Scope } from "effect";
import type { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";
import type { DevSnapshot } from "./snapshot.types.js";

/** Private stage identity lives only within its owning Scope, never a receipt. */
export interface SnapshotPublicationStage {
  readonly projectRoot: string;
  readonly directory: string;
}

/** Native mutations join physical settlement before their scope may clean up. */
export interface SnapshotPublicationNativeOperations {
  readonly stage: (
    root: string,
  ) => Effect.Effect<
    SnapshotPublicationStage,
    DevSnapshotIoError | DevSnapshotRejected,
    Scope.Scope
  >;
  readonly write: (
    stage: SnapshotPublicationStage,
    path: string,
    bytes: Uint8Array,
  ) => Effect.Effect<void, DevSnapshotIoError | DevSnapshotRejected>;
  readonly install: (
    stage: SnapshotPublicationStage,
    generation: string,
  ) => Effect.Effect<string, DevSnapshotIoError | DevSnapshotRejected>;
  readonly point: (
    root: string,
    generation: string,
  ) => Effect.Effect<void, DevSnapshotIoError | DevSnapshotRejected>;
}

/** Publication owns staging and validates copied bytes before granting execution. */
export interface SnapshotPublicationOperations {
  readonly publish: (
    root: string,
    sourceDirectory: string,
    receipt: DevSnapshot,
    current: Effect.Effect<void, DevSnapshotIoError | DevSnapshotRejected>,
  ) => Effect.Effect<string, DevSnapshotIoError | DevSnapshotRejected>;
}

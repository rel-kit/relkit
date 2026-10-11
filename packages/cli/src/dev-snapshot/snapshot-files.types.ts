/**
 * Defines snapshot filesystem authority independently from Bun or compiler
 * services. Each request supplies its root and bounded relative path; adapters
 * reject links and escaped identities rather than returning partial content.
 */
import type { Effect } from "effect";
import type { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";
import type { SnapshotMember } from "./snapshot.types.js";
import type { Schema } from "effect";
import type { SnapshotTypecheckObservation } from "./snapshot.schemas.js";

/** Observed file/directory resolution query, including absent shadow declarations. */
export type TypecheckObservation = Schema.Schema.Type<typeof SnapshotTypecheckObservation>;

/** Physical root witness retained only by one acquired file authority, never persisted. */
export interface SnapshotReadRoot {
  readonly path: string;
  readonly physical: string;
  readonly device: number;
  readonly inode: number;
}

/** One no-follow descriptor held only within a finite verification batch Scope. */
export interface SnapshotOpenMember {
  readonly path: string;
  readonly descriptor: number;
}

/** Native byte access and complete source enumeration substituted by test Layers. */
export interface SnapshotFileOperations {
  /** Replays bounded resolution queries with the original project containment authority. */
  readonly observations: (
    root: string,
    queries: readonly TypecheckObservation[],
  ) => Effect.Effect<readonly TypecheckObservation[], DevSnapshotIoError | DevSnapshotRejected>;

  readonly read: (
    root: string,
    path: string,
    limit: number,
  ) => Effect.Effect<Uint8Array, DevSnapshotIoError | DevSnapshotRejected>;

  /** Hashes all complete bounded members, yielding between finite descriptor batches. */
  readonly identities: (
    root: string,
    paths: readonly string[],
    limit: number,
  ) => Effect.Effect<readonly SnapshotMember[], DevSnapshotIoError | DevSnapshotRejected>;

  /** Hashes expected members and returns only the first divergent caller index. */
  readonly mismatch: (
    root: string,
    members: readonly SnapshotMember[],
    limit: number,
  ) => Effect.Effect<number | undefined, DevSnapshotIoError | DevSnapshotRejected>;

  /** Enumerates project input paths while excluding runtime state and environment files. */
  readonly projectPaths: (
    root: string,
  ) => Effect.Effect<readonly string[], DevSnapshotIoError | DevSnapshotRejected>;
}

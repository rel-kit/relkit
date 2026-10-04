import type { Effect } from "effect";
import type { BucketProvider, BucketObjectMetadata } from "@relkit/buckets";
import type { TestBucketObject } from "./buckets-types.js";
import type { BucketStorageSnapshot as SnapshotSchema } from "./bucket-storage.schemas.js";

/** Detached native bucket transfer derived from its decoding schema authority. */
export type BucketStorageSnapshot = typeof SnapshotSchema.Type;

/** Effect decisions over authoritative writable bucket bytes and native metadata. */
export interface BucketStorageService {
  readonly stateRoot: string;
  readonly put: (
    ...args: Parameters<NonNullable<BucketProvider["put"]>>
  ) => Effect.Effect<void, unknown>;
  readonly get: (
    ...args: Parameters<NonNullable<BucketProvider["get"]>>
  ) => Effect.Effect<Uint8Array | undefined, unknown>;
  readonly head: (
    ...args: Parameters<NonNullable<BucketProvider["head"]>>
  ) => Effect.Effect<BucketObjectMetadata | undefined, unknown>;
  readonly delete: (
    ...args: Parameters<NonNullable<BucketProvider["delete"]>>
  ) => Effect.Effect<void, unknown>;
  readonly exists: (
    ...args: Parameters<NonNullable<BucketProvider["exists"]>>
  ) => Effect.Effect<boolean, unknown>;
  readonly list: (
    ...args: Parameters<NonNullable<BucketProvider["list"]>>
  ) => Effect.Effect<readonly string[], unknown>;
  readonly inspect: Effect.Effect<readonly TestBucketObject[]>;
  readonly snapshot: Effect.Effect<BucketStorageSnapshot>;
  readonly restore: (snapshot: unknown) => Effect.Effect<void, unknown>;
  readonly clear: Effect.Effect<void>;
  readonly close: Effect.Effect<void>;
}

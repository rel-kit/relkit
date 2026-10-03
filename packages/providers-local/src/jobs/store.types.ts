import type { Effect } from "effect";
import type { LocalOperationError } from "../local-effect.js";
import type { JsonValue } from "@relkit/contracts";
import type { createJobStorePaths } from "./store-files.js";
import type {
  JobRecordSchema,
  JobIndexEntrySchema,
  JobIndexSchema,
  JobCheckpointSchema,
} from "./store.schemas.js";

/** Durable commit milestones available to fault-injection and observation hooks. */
export type JobStoreBoundary = "record-fsynced" | "index-committed" | "checkpoint-committed";

/** Clock, record validation and durable-boundary hooks for journal ownership. */
export interface JobStoreOptions {
  readonly now?: () => number;
  /** Test-only failure seam; an error rejects append before acknowledgement. */
  readonly onBoundary?: (boundary: JobStoreBoundary) => void | Promise<void>;
  /** Optional semantic guard used by durable stores layered on this record format. */
  readonly validateData?: (data: JsonValue) => void;
}

/** Canonical JSON record input before sequence and timestamp assignment. */
export interface JobRecordInput {
  readonly instanceId: string;
  readonly kind: string;
  readonly data: JsonValue;
  readonly timestamp?: number;
}

/** Versioned durable journal record with ordered sequence and timestamp. */
export type JobRecord = typeof JobRecordSchema.Type;

/** Latest record sequence and byte offset for one job instance. */
export type JobIndexEntry = typeof JobIndexEntrySchema.Type;

/** Versioned index rebuilt from the durable journal. */
export type JobStoreIndex = typeof JobIndexSchema.Type;

/** Committed sequence, record count and byte offset used for recovery. */
export type JobStoreCheckpoint = typeof JobCheckpointSchema.Type;

/** Immutable recovered records, index and checkpoint. */
export interface JobStoreSnapshot {
  readonly records: readonly JobRecord[];
  readonly index: JobStoreIndex;
  readonly checkpoint: JobStoreCheckpoint;
}

/** Compatibility journal interface with durable append and explicit close. */
export interface JobStore {
  readonly root: string;
  readonly paths: Readonly<ReturnType<typeof createJobStorePaths>>;
  readonly append: (input: JobRecordInput) => Promise<JobRecord>;
  readonly snapshot: () => JobStoreSnapshot;
  readonly close: () => Promise<void>;
}

/** Effect operations for a durable journal and its committed snapshot. */
export interface JobStoreEffects {
  readonly root: string;
  readonly paths: JobStore["paths"];
  readonly append: (input: JobRecordInput) => Effect.Effect<JobRecord, LocalOperationError>;
  readonly snapshot: () => Effect.Effect<JobStoreSnapshot>;
  readonly close: () => Effect.Effect<void>;
}

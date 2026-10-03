import type { EventPublishResult, UnknownEventEnvelope } from "@relkit/events";
import type {
  JobStoreBoundary,
  JobStoreCheckpoint,
  JobStoreIndex,
  JobStoreOptions,
} from "../jobs/store.js";
import type { createJobStorePaths } from "../jobs/store-files.js";
import type { EVENT_LOG_VERSION } from "./log.js";

/** Durable event-log commit milestones exposed to hooks. */
export type EventLogBoundary = JobStoreBoundary;

/** Owned paths for durable event records and derived metadata. */
export type EventLogPaths = ReturnType<typeof createJobStorePaths>;

/** Event-log validation and durable commit hook configuration. */
export interface EventLogOptions extends Pick<JobStoreOptions, "now" | "onBoundary"> {}

/** Accepted event envelope with its durable journal identity. */
export interface EventLogRecord {
  readonly version: typeof EVENT_LOG_VERSION;
  readonly sequence: number;
  readonly kind: "accepted";
  readonly accepted: true;
  readonly timestamp: number;
  readonly envelope: UnknownEventEnvelope;
}

/** Immutable persisted event records and recovery metadata. */
export interface EventLogSnapshot {
  readonly records: readonly EventLogRecord[];
  readonly index: JobStoreIndex;
  readonly checkpoint: JobStoreCheckpoint;
}

/** Promise event log operations and synchronous recovered snapshot. */
export interface EventLog {
  readonly root: string;
  readonly paths: EventLogPaths;
  readonly append: (envelope: EventLogInput) => Promise<EventLogRecord>;
  readonly snapshot: () => EventLogSnapshot;
  readonly close: () => Promise<void>;
}

/** Event envelope input before journal sequence assignment. */
export type EventLogInput = UnknownEventEnvelope | EventPublishResult<string, number, unknown>;

/**
 * Defines redacted early retention separately from persistence and runtime sinks.
 * Sequence numbers belong to this session and establish an ordered handoff fence;
 * acknowledgements never reset cumulative loss or diagnostic delivery counters.
 */
import type { Effect } from "effect";
import type { ObservabilityRecord, DiagnosticRecord } from "./model.js";
import type { RedactionPolicy } from "./redaction.js";
import type { RedactedObservabilityRecord } from "./record-admission.types.js";
import type { RecordAdmissionError } from "./record-admission.js";
import type { EarlyRetentionError } from "./early-records-error.js";

/** Bounded session policy; bytes are counted after redaction and JSON encoding. */
export interface EarlyRetentionOptions {
  readonly maxRecords?: number;
  readonly maxBytes?: number;
  readonly redaction?: RedactionPolicy;
}

/** One immutable record eligible for ordered, once-only handoff. */
export interface EarlyRetainedRecord {
  readonly sequence: number;
  readonly bytes: number;
  readonly record: RedactedObservabilityRecord;
  readonly identity?: EarlyRecordIdentity;
}

/** Preserved producer identity allows idempotent persistence after a lost acknowledgement. */
export interface EarlyRecordIdentity {
  readonly key: string;
  readonly origin: "application" | "relkit" | "inspector";
}

/** Independent loss evidence survives eviction and successful handoff. */
export interface EarlyRetentionStatus {
  readonly bufferedRecords: number;
  readonly bufferedBytes: number;
  readonly droppedRecords: number;
  readonly droppedBytes: number;
  readonly incomplete: boolean;
}

/** State owned by one acquired Layer; there is no module-global event buffer. */
export interface EarlyRetentionState {
  readonly entries: readonly EarlyRetainedRecord[];
  readonly bytes: number;
  readonly sequence: number;
  readonly acknowledged: number;
  readonly droppedRecords: number;
  readonly droppedBytes: number;
  readonly reportedRecords: number;
  readonly reportedBytes: number;
}

/** Injectable retention contract; persistence owns acknowledgement policy. */
export interface EarlyRetentionOperations {
  readonly configure: (options: EarlyRetentionOptions) => Effect.Effect<void, EarlyRetentionError>;
  readonly admit: (
    record: ObservabilityRecord,
    identity?: EarlyRecordIdentity,
  ) => Effect.Effect<
    RedactedObservabilityRecord | undefined,
    RecordAdmissionError | EarlyRetentionError
  >;
  readonly snapshot: () => Effect.Effect<readonly EarlyRetainedRecord[]>;
  readonly status: () => Effect.Effect<EarlyRetentionStatus>;
  readonly acknowledge: (through: number) => Effect.Effect<void, EarlyRetentionError>;
  /** Produces at most one coalesced diagnostic per new loss total; never buffers itself. */
  readonly overflow: () => Effect.Effect<DiagnosticRecord | undefined>;
}

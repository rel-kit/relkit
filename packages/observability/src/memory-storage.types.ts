/** Bounded application memory owned by one observability runtime; no disk paths. */
import type { RedactedObservabilityRecord } from "./record-admission.js";
import type { ObservabilityIndexEntry } from "./storage/index.types.js";

/** One admitted record and its stable cursor inside the current runtime. */
export interface MemoryStorageRecord {
  readonly record: RedactedObservabilityRecord;
  readonly entry: ObservabilityIndexEntry;
}

/** Mutable bounded retention state, private to the acquired memory store. */
export interface MemoryStorageState {
  readonly records: Map<string, MemoryStorageRecord>;
  sequence: number;
  bytes: number;
}

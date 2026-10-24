/**
 * Storage is an explicitly supplied capability. The runtime sends admitted records
 * and owns closing the supplied handle; implementations own their physical assets.
 */
import type { ObservabilityQuery } from "./query-types.js";
import type { RedactedObservabilityRecord } from "./record-admission.js";

/** Persistence and query authority selected by the runtime's composition root. */
export interface ObservabilityRuntimeStorage {
  /** Admits an already redacted record to this store and returns its stored representation. */
  readonly append: (
    record: RedactedObservabilityRecord,
  ) => Promise<RedactedObservabilityRecord | undefined>;
  /** Queries records retained by this implementation. */
  readonly query: ObservabilityQuery;
  /** Finishes accepted writes before returning. */
  readonly flush: () => Promise<void>;
  /** Releases the selected storage once the runtime retires. */
  readonly close: () => Promise<void>;
}

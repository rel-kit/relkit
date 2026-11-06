import type { ObservabilityRecord } from "../model.js";
import type { RedactedObservabilityRecord } from "../record-admission.js";
import type { RedactionPolicy } from "../redaction.js";
import type { ObservabilityCollector } from "../collector.js";
import type { ObservabilityIndex } from "./index.js";
import type { OBSERVABILITY_SEGMENT_FAILURE } from "./segments.js";

/** The named rotation hook available to controlled failure tests. */
export type ObservabilitySegmentFailure = typeof OBSERVABILITY_SEGMENT_FAILURE;

/** Callback that can interrupt a segment rotation at its named hook. */
export interface SegmentFailureControls {
  readonly check: (point: ObservabilitySegmentFailure) => void | Promise<void>;
}

/** Storage bounds, redaction, and optional index callbacks for a segment store. */
export interface ObservabilitySegmentOptions {
  readonly root?: string;
  readonly maxSegmentBytes?: number;
  readonly maxRecordsPerSegment?: number;
  readonly maxBytes?: number;
  readonly maxRecords?: number;
  readonly redaction?: RedactionPolicy;
  readonly collector?: Pick<ObservabilityCollector, "collect">;
  readonly index?: Pick<ObservabilityIndex, "append" | "finalize">;
  readonly failures?: SegmentFailureControls;
  readonly onFailure?: (point: ObservabilitySegmentFailure) => void | Promise<void>;
}

/** Live store whose close releases every active segment handle. */
export interface ObservabilitySegmentStore {
  readonly root: string;
  readonly append: (
    record: ObservabilityRecord,
  ) => Promise<RedactedObservabilityRecord | undefined>;
  readonly flush: () => Promise<void>;
  readonly shutdown: () => Promise<void>;
  readonly close: () => Promise<void>;
}

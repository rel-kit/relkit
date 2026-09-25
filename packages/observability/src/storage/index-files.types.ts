import type { RedactedObservabilityRecord } from "../record-admission.types.js";
import type { SegmentDirectory } from "./segment-files.types.js";

/** One recognized segment during an index rebuild. */
export interface SegmentScan {
  readonly path: string;
  readonly directory: SegmentDirectory;
  readonly active: boolean;
  readonly bytes: number;
}

/** One redacted record and its byte location in a segment. */
export interface SegmentLine {
  readonly segment: SegmentScan;
  readonly record: RedactedObservabilityRecord;
  readonly offset: number;
  readonly bytes: number;
}

/** Callbacks invoked in segment and line scan order. */
export interface SegmentScanVisitor {
  readonly segment: (value: SegmentScan) => void | Promise<void>;
  readonly line: (value: SegmentLine) => void | Promise<void>;
}

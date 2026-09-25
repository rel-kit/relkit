import type { ObservabilityIndexEntry } from "./index.types.js";
import type { RedactionPolicy } from "../redaction.types.js";

/** Mutable retention metadata for one segment. */
export interface MutableSegment {
  path: string;
  active: boolean;
  bytes: number;
  oldest: number;
  newest: number;
  entries: Set<string>;
}

/** Mutable in-memory index and lookup maps. */
export interface IndexState {
  readonly records: Map<string, ObservabilityIndexEntry>;
  readonly locations: Map<string, string>;
  readonly segments: Map<string, MutableSegment>;
  readonly fields: Readonly<
    Record<"requestId" | "originRequestId" | "traceId" | "spanId", Map<string, Set<string>>>
  >;
  sequence: number;
}

/** Validated index bounds, clock, and redaction settings. */
export interface IndexConfig {
  readonly maxAgeMs: number;
  readonly maxBytes: number;
  readonly maxEntries: number;
  readonly pageSize: number;
  readonly now: () => number;
  readonly redaction?: RedactionPolicy;
}

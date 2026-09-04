import type { LogLevel, ObservabilityRecord, ObservabilitySignal } from "../model.js";
import type { RedactedObservabilityRecord } from "../record-admission.js";
import type { RedactionPolicy } from "../redaction.js";

export const OBSERVABILITY_INDEX_VERSION = 1 as const;
export const DEFAULT_INDEX_MAX_ENTRIES = 8_192;
export const DEFAULT_INDEX_PAGE_SIZE = 100;
export const DEFAULT_RETENTION_MAX_BYTES = 32 * 1024 * 1024;
export const DEFAULT_RETENTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export interface ObservabilityRetentionOptions {
  readonly maxAgeMs?: number;
  readonly maxBytes?: number;
  readonly maxEntries?: number;
}

export interface ObservabilityIndexOptions extends ObservabilityRetentionOptions {
  readonly root?: string;
  readonly retention?: ObservabilityRetentionOptions;
  readonly redaction?: RedactionPolicy;
  readonly now?: () => number;
  readonly pageSize?: number;
  readonly maxPageSize?: number;
}

export interface ObservabilityIndexEntry {
  readonly cursor: string;
  readonly signal: ObservabilitySignal;
  readonly segment: string;
  readonly offset: number;
  readonly bytes: number;
  readonly timestamp: string;
  readonly requestId?: string;
  readonly originRequestId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly routeId?: string;
  readonly functionId?: string;
  readonly serviceId?: string;
  readonly outcome?: string;
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly severity?: LogLevel;
}

export interface ObservabilityIndexPageOptions {
  readonly order?: "asc" | "desc";
  readonly signal?: ObservabilitySignal;
  readonly cursor?: string;
  readonly limit?: number;
  readonly routeId?: string;
  readonly functionId?: string;
  readonly outcome?: string;
  readonly requestId?: string;
  readonly originRequestId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly serviceId?: string;
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly severity?: LogLevel;
}

export interface ObservabilityIndexPage {
  readonly entries: readonly ObservabilityIndexEntry[];
  readonly nextCursor?: string;
}

export interface ObservabilityIndexStats {
  readonly records: number;
  readonly segments: number;
  readonly bytes: number;
}

export interface ObservabilityRetentionReport {
  readonly removedSegments: number;
  readonly removedRecords: number;
  readonly removedBytes: number;
}

export interface ObservabilityIndex {
  readonly root: string;
  readonly append: (
    record: RedactedObservabilityRecord,
    segmentPath: string,
    offset: number,
    bytes: number,
  ) => Promise<ObservabilityIndexEntry>;
  readonly finalize: (activePath: string, finalPath: string) => Promise<void>;
  readonly rebuild: () => Promise<void>;
  readonly retain: () => Promise<ObservabilityRetentionReport>;
  readonly page: (options?: ObservabilityIndexPageOptions) => ObservabilityIndexPage;
  readonly tracePage: (options?: ObservabilityIndexPageOptions) => ObservabilityIndexPage;
  readonly read: (
    entry: ObservabilityIndexEntry,
  ) => Promise<RedactedObservabilityRecord | undefined>;
  readonly stats: () => ObservabilityIndexStats;
  readonly flush: () => Promise<void>;
  readonly close: () => Promise<void>;
}

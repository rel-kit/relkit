import type { LogLevel, LogRecord, RequestRecord, SpanRecord, TraceRecord } from "./model.js";
import type { RedactionPolicy } from "./redaction.js";
import type { RequestExecutionDetail } from "./execution-assembly.js";
import type { OBSERVABILITY_QUERY_PROTOCOL, OBSERVABILITY_QUERY_VERSION } from "./query-types.js";
/** Filters and pagination controls accepted by local and remote queries. */
export interface ObservabilityQueryRequest {
  readonly search?: string;
  readonly source?: "application" | "relkit" | "inspector";
  readonly order?: "asc" | "desc";
  readonly protocol?: typeof OBSERVABILITY_QUERY_PROTOCOL;
  readonly version?: typeof OBSERVABILITY_QUERY_VERSION;
  readonly cursor?: string;
  readonly limit?: number;
  readonly from?: string;
  readonly to?: string;
  readonly severity?: LogLevel;
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
  /** Request status: exact (`500`) or class (`5xx`). Selects request records only. */
  readonly status?: string | number;
  /** Request method, compared case-insensitively. Selects request records only. */
  readonly method?: string;
  /** Prefix of the raw request path, starting with `/`. Selects request records only. */
  readonly path?: string;
  /** Declared error identifier: a record's `errorId` or a span's `relkit.error.id`. */
  readonly errorId?: string;
  /** Adds `total`, the number of records matching the filters, to the page (scans every match). */
  readonly count?: boolean | "true" | "false";
}
/** Protocol identity returned with every query response. */
export interface ObservabilityQueryVersion {
  readonly protocol: typeof OBSERVABILITY_QUERY_PROTOCOL;
  readonly version: typeof OBSERVABILITY_QUERY_VERSION;
}
/** A cursor-addressable page of query items. */
export interface ObservabilityQueryPage<T> extends ObservabilityQueryVersion {
  readonly items: readonly T[];
  readonly nextCursor?: string;
  /** Records matching the filters across all pages, present when the query asked for `count`. */
  readonly total?: number;
}
/** Page of request lifecycle records. */
export type RequestQueryResponse = ObservabilityQueryPage<RequestRecord>;
/** Log record with optional local cursor and origin. */
export interface LogQueryItem extends LogRecord {
  readonly cursor?: string;
  readonly origin?: "application" | "relkit" | "inspector";
}
/** Page of log records. */
export type LogQueryResponse = ObservabilityQueryPage<LogQueryItem>;
/** Record types that can contribute to a trace page. */
export type TraceQueryItem = TraceRecord | SpanRecord | RequestRecord;
/** Page of trace records. */
export type TraceQueryResponse = ObservabilityQueryPage<TraceQueryItem>;
/** Assembled request detail with protocol identity. */
export interface RequestDetailResponse extends ObservabilityQueryVersion, RequestExecutionDetail {}
/** One log detail with protocol identity. */
export interface LogDetailResponse extends ObservabilityQueryVersion {
  readonly log: LogQueryItem;
}
/** Trace detail and coalesced spans. */
export interface TraceDetailResponse extends ObservabilityQueryVersion {
  readonly nextCursor?: string;
  readonly trace?: TraceRecord;
  readonly spans: readonly SpanRecord[];
  readonly records: readonly TraceQueryItem[];
}
/** Bounds and redaction policy for query construction. */
export interface ObservabilityQueryOptions {
  readonly maxPageSize?: number;
  readonly pageSize?: number;
  readonly maxDetailRecords?: number;
  readonly redaction?: RedactionPolicy;
}
/** Query operations available from an observability runtime. */
export interface ObservabilityQuery {
  readonly requests: (query?: ObservabilityQueryRequest) => Promise<RequestQueryResponse>;
  readonly logs: (query?: ObservabilityQueryRequest) => Promise<LogQueryResponse>;
  readonly traces: (query?: ObservabilityQueryRequest) => Promise<TraceQueryResponse>;
  readonly request: (requestId: string) => Promise<RequestDetailResponse | undefined>;
  readonly log: (cursor: string) => Promise<LogDetailResponse | undefined>;
  readonly trace: (traceId: string) => Promise<TraceDetailResponse | undefined>;
}

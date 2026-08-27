import { PROTOCOL_VERSION } from "@relkit/contracts";
import type {
  LogLevel,
  LogRecord,
  ObservabilityRecord,
  RequestRecord,
  SpanRecord,
  TraceRecord,
} from "./model.js";
import type { RedactionPolicy } from "./redaction.js";

export const OBSERVABILITY_QUERY_PROTOCOL = "relkit.observability.query" as const;
export const OBSERVABILITY_QUERY_VERSION = PROTOCOL_VERSION;
export const DEFAULT_OBSERVABILITY_QUERY_LIMIT = 50;
export const MAX_OBSERVABILITY_QUERY_LIMIT = 100;

export interface ObservabilityQueryRequest {
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
  readonly traceId?: string;
  readonly serviceId?: string;
  readonly generationId?: string;
  readonly graphHash?: string;
}

export interface ObservabilityQueryVersion {
  readonly protocol: typeof OBSERVABILITY_QUERY_PROTOCOL;
  readonly version: typeof OBSERVABILITY_QUERY_VERSION;
}

export interface ObservabilityQueryPage<T> extends ObservabilityQueryVersion {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

export type RequestQueryResponse = ObservabilityQueryPage<RequestRecord>;
export type LogQueryResponse = ObservabilityQueryPage<LogRecord>;
export type TraceQueryItem = TraceRecord | SpanRecord;
export type TraceQueryResponse = ObservabilityQueryPage<TraceQueryItem>;

export interface RequestDetailResponse extends ObservabilityQueryVersion {
  readonly request: RequestRecord;
  readonly records: readonly ObservabilityRecord[];
}

export interface LogDetailResponse extends ObservabilityQueryVersion {
  readonly log: LogRecord;
}

export interface TraceDetailResponse extends ObservabilityQueryVersion {
  readonly trace?: TraceRecord;
  readonly spans: readonly SpanRecord[];
  readonly records: readonly TraceQueryItem[];
}

export interface ObservabilityQueryOptions {
  readonly maxPageSize?: number;
  readonly pageSize?: number;
  readonly maxDetailRecords?: number;
  readonly redaction?: RedactionPolicy;
}

export interface ObservabilityQuery {
  readonly requests: (query?: ObservabilityQueryRequest) => Promise<RequestQueryResponse>;
  readonly logs: (query?: ObservabilityQueryRequest) => Promise<LogQueryResponse>;
  readonly traces: (query?: ObservabilityQueryRequest) => Promise<TraceQueryResponse>;
  readonly request: (requestId: string) => Promise<RequestDetailResponse | undefined>;
  readonly log: (cursor: string) => Promise<LogDetailResponse | undefined>;
  readonly trace: (traceId: string) => Promise<TraceDetailResponse | undefined>;
}

export class ObservabilityQueryError extends TypeError {
  constructor(
    readonly code:
      "RELKIT_OBSERVABILITY_QUERY_INVALID" | "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "ObservabilityQueryError";
  }
}

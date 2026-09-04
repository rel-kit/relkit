import type { ObservabilityRecord } from "./model.js";
import {
  DEFAULT_OBSERVABILITY_QUERY_LIMIT,
  MAX_OBSERVABILITY_QUERY_LIMIT,
  ObservabilityQueryError,
  type ObservabilityQueryPage,
  type ObservabilityQueryRequest,
} from "./query-types.js";

export interface NormalizedQuery extends ObservabilityQueryRequest {
  readonly limit: number;
  readonly fromMs?: number;
  readonly toMs?: number;
}

export function validate(value: ObservabilityQueryRequest, maximum: number): NormalizedQuery {
  if (value.search !== undefined && (typeof value.search !== "string" || value.search.length > 512))
    throw new ObservabilityQueryError(
      "RELKIT_OBSERVABILITY_QUERY_INVALID",
      "Search must contain at most 512 characters",
    );
  if (value.source !== undefined && !["application", "relkit", "inspector"].includes(value.source))
    throw new ObservabilityQueryError(
      "RELKIT_OBSERVABILITY_QUERY_INVALID",
      "Log source is invalid",
    );
  if (value.order !== undefined && value.order !== "asc" && value.order !== "desc")
    throw new ObservabilityQueryError(
      "RELKIT_OBSERVABILITY_QUERY_INVALID",
      "Query order is invalid",
    );
  if (value.protocol !== undefined && value.protocol !== "relkit.observability.query")
    throw new ObservabilityQueryError(
      "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
      "Unsupported observability query protocol",
    );
  if (value.version !== undefined && value.version !== 1)
    throw new ObservabilityQueryError(
      "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
      "Unsupported observability query version",
    );
  const limit = value.limit ?? DEFAULT_OBSERVABILITY_QUERY_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new ObservabilityQueryError(
      "RELKIT_OBSERVABILITY_QUERY_INVALID",
      "Observability query limit is invalid",
    );
  const fromMs = value.from === undefined ? undefined : parseTime(value.from, "from");
  const toMs = value.to === undefined ? undefined : parseTime(value.to, "to");
  if (fromMs !== undefined && toMs !== undefined && fromMs > toMs)
    throw new ObservabilityQueryError(
      "RELKIT_OBSERVABILITY_QUERY_INVALID",
      "Observability query time range is invalid",
    );
  if (value.cursor !== undefined && value.cursor.length === 0)
    throw new ObservabilityQueryError(
      "RELKIT_OBSERVABILITY_QUERY_INVALID",
      "Observability query cursor is invalid",
    );
  if (
    value.cursor !== undefined &&
    (!/^\d+$/.test(value.cursor) ||
      !Number.isSafeInteger(Number(value.cursor)) ||
      Number(value.cursor) < 0)
  )
    throw new ObservabilityQueryError(
      "RELKIT_OBSERVABILITY_QUERY_INVALID",
      "Observability query cursor is invalid",
    );
  if (
    value.severity !== undefined &&
    !["trace", "debug", "info", "warn", "error", "fatal"].includes(value.severity)
  )
    throw new ObservabilityQueryError(
      "RELKIT_OBSERVABILITY_QUERY_INVALID",
      "Observability query severity is invalid",
    );
  for (const [name, item] of [
    ["routeId", value.routeId],
    ["functionId", value.functionId],
    ["outcome", value.outcome],
    ["requestId", value.requestId],
    ["originRequestId", value.originRequestId],
    ["traceId", value.traceId],
    ["spanId", value.spanId],
    ["serviceId", value.serviceId],
    ["generationId", value.generationId],
    ["graphHash", value.graphHash],
  ] as const) {
    if (item !== undefined && item.length === 0)
      throw new ObservabilityQueryError(
        "RELKIT_OBSERVABILITY_QUERY_INVALID",
        `Observability query ${name} is invalid`,
      );
  }
  return {
    ...value,
    limit: Math.min(limit, maximum),
    ...(fromMs === undefined ? {} : { fromMs }),
    ...(toMs === undefined ? {} : { toMs }),
  };
}

export function matches(record: ObservabilityRecord, query: NormalizedQuery): boolean {
  const value = record as ObservabilityRecord & { readonly correlationId?: string };
  return (
    (query.search === undefined ||
      JSON.stringify(record).toLowerCase().includes(query.search.trim().toLowerCase())) &&
    (query.source === undefined ||
      (record.signal === "log" &&
        (record.component.startsWith("cli.")
          ? "relkit"
          : record.component === "inspector"
            ? "inspector"
            : "application") === query.source)) &&
    (query.requestId === undefined || value.requestId === query.requestId) &&
    (query.originRequestId === undefined ||
      ("originRequestId" in value && value.originRequestId === query.originRequestId)) &&
    (query.generationId === undefined || value.generationId === query.generationId) &&
    (query.graphHash === undefined || value.graphHash === query.graphHash) &&
    (query.serviceId === undefined || value.serviceId === query.serviceId)
  );
}

export function inTimeRange(timestamp: string, query: NormalizedQuery): boolean {
  const time = Date.parse(timestamp);
  return (
    Number.isFinite(time) &&
    (query.fromMs === undefined || time >= query.fromMs) &&
    (query.toMs === undefined || time <= query.toMs)
  );
}

export function response<T>(items: readonly T[], nextCursor?: string): ObservabilityQueryPage<T> {
  return Object.freeze({
    protocol: "relkit.observability.query" as const,
    version: 1 as const,
    items: Object.freeze([...items]),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  });
}

export function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new ObservabilityQueryError(
      "RELKIT_OBSERVABILITY_QUERY_INVALID",
      "Observability query bound is invalid",
    );
  return Math.min(value, MAX_OBSERVABILITY_QUERY_LIMIT);
}

function parseTime(value: string, name: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result))
    throw new ObservabilityQueryError(
      "RELKIT_OBSERVABILITY_QUERY_INVALID",
      `Observability query ${name} time is invalid`,
    );
  return result;
}

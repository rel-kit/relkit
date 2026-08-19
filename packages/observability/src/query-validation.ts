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
  if (value.protocol !== undefined && value.protocol !== "zsys.observability.query")
    throw new ObservabilityQueryError(
      "ZSYS_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
      "Unsupported observability query protocol",
    );
  if (value.version !== undefined && value.version !== 1)
    throw new ObservabilityQueryError(
      "ZSYS_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
      "Unsupported observability query version",
    );
  const limit = value.limit ?? DEFAULT_OBSERVABILITY_QUERY_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new ObservabilityQueryError(
      "ZSYS_OBSERVABILITY_QUERY_INVALID",
      "Observability query limit is invalid",
    );
  const fromMs = value.from === undefined ? undefined : parseTime(value.from, "from");
  const toMs = value.to === undefined ? undefined : parseTime(value.to, "to");
  if (fromMs !== undefined && toMs !== undefined && fromMs > toMs)
    throw new ObservabilityQueryError(
      "ZSYS_OBSERVABILITY_QUERY_INVALID",
      "Observability query time range is invalid",
    );
  if (value.cursor !== undefined && value.cursor.length === 0)
    throw new ObservabilityQueryError(
      "ZSYS_OBSERVABILITY_QUERY_INVALID",
      "Observability query cursor is invalid",
    );
  if (
    value.cursor !== undefined &&
    (!Number.isSafeInteger(Number(value.cursor)) || Number(value.cursor) < 0)
  )
    throw new ObservabilityQueryError(
      "ZSYS_OBSERVABILITY_QUERY_INVALID",
      "Observability query cursor is invalid",
    );
  if (
    value.severity !== undefined &&
    !["trace", "debug", "info", "warn", "error", "fatal"].includes(value.severity)
  )
    throw new ObservabilityQueryError(
      "ZSYS_OBSERVABILITY_QUERY_INVALID",
      "Observability query severity is invalid",
    );
  for (const [name, item] of [
    ["routeId", value.routeId],
    ["functionId", value.functionId],
    ["outcome", value.outcome],
    ["requestId", value.requestId],
    ["traceId", value.traceId],
    ["generationId", value.generationId],
    ["graphHash", value.graphHash],
  ] as const) {
    if (item !== undefined && item.length === 0)
      throw new ObservabilityQueryError(
        "ZSYS_OBSERVABILITY_QUERY_INVALID",
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
    (query.requestId === undefined ||
      value.requestId === query.requestId ||
      value.correlationId === query.requestId) &&
    (query.generationId === undefined || value.generationId === query.generationId) &&
    (query.graphHash === undefined || value.graphHash === query.graphHash)
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
    protocol: "zsys.observability.query" as const,
    version: 1 as const,
    items: Object.freeze([...items]),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  });
}

export function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new ObservabilityQueryError(
      "ZSYS_OBSERVABILITY_QUERY_INVALID",
      "Observability query bound is invalid",
    );
  return Math.min(value, MAX_OBSERVABILITY_QUERY_LIMIT);
}

function parseTime(value: string, name: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result))
    throw new ObservabilityQueryError(
      "ZSYS_OBSERVABILITY_QUERY_INVALID",
      `Observability query ${name} time is invalid`,
    );
  return result;
}

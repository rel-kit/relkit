/** Compiles validated query filters into bound native SQL parameters; no user value becomes SQL. */
import type { DuckDBValue } from "@duckdb/node-api";
import { normalizedMethod, statusRange, type ObservabilityQueryRequest } from "relkit/observability";
import type { NormalizedQuery } from "relkit/observability/query";
/** @param kind - Signal family. @param query - Validated query. @returns SQL clauses and ordered values. */
export function duckdbQueryFilters(kind: "logs" | "requests" | "traces", query: NormalizedQuery) {
  const clauses = [
    kind === "logs"
      ? "signal = 'log'"
      : kind === "requests"
        ? "signal = 'request'"
        : "signal IN ('trace', 'span', 'request')",
  ];
  const values: DuckDBValue[] = [];
  const add = (clause: string, ...bound: DuckDBValue[]): void => {
    clauses.push(`(${clause})`);
    values.push(...bound);
  };
  const descending = query.order === "desc";
  if (query.cursor !== undefined && !(kind === "traces" && query.traceId === undefined))
    add(`id ${descending ? "<" : ">"} ?`, BigInt(query.cursor));
  if (query.fromMs !== undefined) add("recorded_at >= ?", query.fromMs);
  if (query.toMs !== undefined) add("recorded_at <= ?", query.toMs);
  if (query.source !== undefined) add("origin = ?", query.source);
  if (query.search?.trim())
    add("strpos(lower(payload::VARCHAR), lower(?)) > 0", query.search.trim());
  for (const [key, column] of Object.entries({
    severity: "level",
    routeId: "routeId",
    functionId: "functionId",
    outcome: "outcome",
    serviceId: "serviceId",
    generationId: "generationId",
    graphHash: "graphHash",
  })) {
    const value = query[key as keyof ObservabilityQueryRequest];
    if (typeof value === "string") add(`json_extract_string(payload, '$.${column}') = ?`, value);
  }
  for (const [key, column] of Object.entries({
    traceId: "trace_id",
    spanId: "span_id",
    requestId: "request_id",
    originRequestId: "origin_request_id",
  })) {
    const value = query[key as keyof ObservabilityQueryRequest];
    if (typeof value === "string") add(`${column} = ?`, value);
  }
  requestFilters(query, add);
  return { clauses, values };
}
/**
 * Compiles the request filters with the in-memory query's rules (`matchesRequestFilters`):
 * status, method and path select request records; `errorId` matches a record's `errorId` or a
 * span's `relkit.error.id` attribute.
 * @param query - Validated query.
 * @param add - Appends one clause with its bound values.
 * @returns Nothing after the present filters were added.
 */
function requestFilters(
  query: NormalizedQuery,
  add: (clause: string, ...values: DuckDBValue[]) => void,
): void {
  const range = query.status === undefined ? undefined : statusRange(query.status);
  if (range !== undefined)
    add(
      "signal = 'request' AND TRY_CAST(json_extract(payload, '$.status') AS INTEGER) BETWEEN ? AND ?",
      range[0],
      range[1],
    );
  if (query.method !== undefined)
    add(
      "signal = 'request' AND upper(json_extract_string(payload, '$.method')) = ?",
      normalizedMethod(query.method),
    );
  if (query.path !== undefined)
    add(
      "signal = 'request' AND starts_with(json_extract_string(payload, '$.rawPath'), ?)",
      query.path,
    );
  if (query.errorId !== undefined)
    add(
      `coalesce(json_extract_string(payload, '$.errorId'),
        json_extract_string(payload, '$.attributes."relkit.error.id"')) = ?`,
      query.errorId,
    );
}

/** Compiles validated query filters into bound native SQL parameters; no user value becomes SQL. */
import type { DuckDBValue } from "@duckdb/node-api";
import type { ObservabilityQueryRequest } from "@relkit/observability";
import type { NormalizedQuery } from "@relkit/observability/internal/query";
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
  const add = (clause: string, value: DuckDBValue): void => {
    clauses.push(clause);
    values.push(value);
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
  return { clauses, values };
}

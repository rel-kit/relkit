/** Builds history paging SQL with stable request/trace revision selection and bound parameters. */
import type { NormalizedQuery } from "@relkit/observability/internal/query";
import { duckdbQueryFilters } from "./duckdb-query-filters.js";
const select = "SELECT id::VARCHAR AS cursor, payload::VARCHAR AS payload, origin FROM records";
/** @param kind - Query signal family. @param query - Validated paging/filter request. @returns Native SQL and ordered bindings. */
export function duckdbQueryPlan(kind: "logs" | "requests" | "traces", query: NormalizedQuery) {
  const { clauses, values } = duckdbQueryFilters(kind, query);
  const descending = query.order === "desc";
  const distinctTraces = kind === "traces" && query.traceId === undefined;
  if (distinctTraces)
    return {
      sql: `WITH matching AS (
             SELECT DISTINCT trace_id FROM records WHERE ${clauses.join(" AND ")} AND trace_id IS NOT NULL
           ), ranked AS (
             SELECT id, payload, origin,
               row_number() OVER (
                 PARTITION BY trace_id
                 ORDER BY CASE signal WHEN 'request' THEN 3 WHEN 'trace' THEN 2 ELSE 1 END DESC, id DESC
               ) AS trace_rank
             FROM records
             WHERE trace_id IN (SELECT trace_id FROM matching)
               AND signal IN ('trace', 'span', 'request')
           )
           SELECT id::VARCHAR AS cursor, payload::VARCHAR AS payload, origin
           FROM ranked WHERE trace_rank = 1
             ${query.cursor === undefined ? "" : `AND id ${descending ? "<" : ">"} ?`}
           ORDER BY id ${descending ? "DESC" : "ASC"} LIMIT ?`,
      values: [
        ...values,
        ...(query.cursor === undefined ? [] : [BigInt(query.cursor)]),
        query.limit + 1,
      ],
    };
  const listSelect = querySelect(kind);
  return {
    sql: `${listSelect} ${clauses.join(" AND ")} ORDER BY id ${descending ? "DESC" : "ASC"} LIMIT ?`,
    values: [...values, query.limit + 1],
  };
}
/** @param kind - Signal family. @returns Request revision projection or ordinary record projection. */
function querySelect(kind: "logs" | "requests" | "traces") {
  return kind === "requests"
    ? `${select.replace(
        "FROM records",
        `FROM (
              SELECT *, row_number() OVER (
                PARTITION BY request_id
                ORDER BY CASE json_extract_string(payload, '$.phase') WHEN 'completed' THEN 1 ELSE 0 END DESC, id DESC
              ) AS request_rank FROM records WHERE signal = 'request'
            )`,
      )} WHERE request_rank = 1 AND`
    : `${select} WHERE`;
}

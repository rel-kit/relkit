import type { DuckDBValue } from "@duckdb/node-api";
import { Effect, Semaphore } from "effect";
import { ObservabilityQueryError } from "../query-types.js";
import type { ObservabilityQueryRequest } from "../query-types.js";
import { response, validate } from "../query-validation.js";
import {
  assembleRequestExecution,
  coalesceSpans,
  MAX_EXECUTION_RECORDS,
} from "../execution-assembly.js";
import { duckdbError } from "./duckdb-error.js";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import { duckdbQueryError } from "./duckdb-query-error.js";
import { readDuckdbSql } from "./duckdb-sql.js";
import { validateLocalRecord } from "./types.js";
import type { StoredLocalRecord } from "./types.types.js";
/**
 * Creates query Effects over one scoped, serialized DuckDB connection.
 *
 * @param connection - Connection owned by the database Scope.
 * @param permit - Semaphore shared with append and retention operations.
 * @returns List and detail Effects with typed database and validation failures.
 * @example
 * const query = makeDuckdbQueryEffect(connection, permit);
 * const page = yield* query.list("logs");
 */
export function makeDuckdbQueryEffect(
  connection: DuckdbConnectionPort,
  permit: Semaphore.Semaphore,
) {
  const select = "SELECT id::VARCHAR AS cursor, payload::VARCHAR AS payload, origin FROM records";
  const rows = Effect.fn("ObservabilityDuckdb.rows")(function* (
    sql: string,
    values: DuckDBValue[] = [],
  ) {
    const result = yield* permit.withPermit(readDuckdbSql(connection, "query", sql, values));
    return yield* Effect.try({
      try: (): StoredLocalRecord[] =>
        result.getRowObjectsJson().map((item) => {
          const envelope: unknown = {
            key: `read:${String(item.cursor)}`,
            origin: item.origin,
            record: JSON.parse(String(item.payload)),
          };
          validateLocalRecord(envelope);
          return { ...envelope.record, cursor: String(item.cursor), origin: envelope.origin };
        }),
      catch: (cause) => duckdbError("decode", cause),
    });
  });
  const list = Effect.fn("ObservabilityDuckdb.query.list")(function* (
    kind: "logs" | "requests" | "traces",
    input: ObservabilityQueryRequest = {},
  ) {
    return yield* observeDuckdb(
      "list",
      Effect.gen(function* () {
        const query = yield* Effect.try({
          try: () => validate(input, 100),
          catch: (cause) =>
            cause instanceof ObservabilityQueryError
              ? duckdbQueryError(cause)
              : duckdbError("validate", cause),
        });
        const distinctTraces = kind === "traces" && query.traceId === undefined;
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
        if (query.cursor !== undefined && !distinctTraces)
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
          if (typeof value === "string")
            add(`json_extract_string(payload, '$.${column}') = ?`, value);
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
        const found = distinctTraces
          ? yield* rows(
              `WITH matching AS (
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
              [
                ...values,
                ...(query.cursor === undefined ? [] : [BigInt(query.cursor)]),
                query.limit + 1,
              ],
            )
          : yield* rows(
              `${select} WHERE ${clauses.join(" AND ")} ORDER BY id ${descending ? "DESC" : "ASC"} LIMIT ?`,
              [...values, query.limit + 1],
            );
        const page = found.slice(0, query.limit);
        return response(page, found.length > query.limit ? page.at(-1)?.cursor : undefined);
      }),
    );
  });
  const detail = Effect.fn("ObservabilityDuckdb.query.detail")(function* (
    kind: "log" | "request" | "trace",
    id: string,
  ) {
    return yield* observeDuckdb(
      "detail",
      Effect.gen(function* () {
        if (kind === "log") {
          yield* Effect.try({
            try: () => validate({ cursor: id }, 100),
            catch: (cause) =>
              cause instanceof ObservabilityQueryError
                ? duckdbQueryError(cause)
                : duckdbError("validate", cause),
          });
          const log = (yield* rows(`${select} WHERE id = ? AND signal = 'log'`, [BigInt(id)]))[0];
          return log ? { ...response([]), log } : undefined;
        }
        if (kind === "request") {
          const records = yield* rows(
            `${select} WHERE request_id = ? OR origin_request_id = ? OR trace_id IN
          (SELECT trace_id FROM records WHERE signal = 'request' AND request_id = ?)
          ORDER BY id DESC LIMIT ?`,
            [id, id, id, MAX_EXECUTION_RECORDS + 1],
          );
          const execution = assembleRequestExecution(records, id);
          return execution ? { ...response([]), ...execution } : undefined;
        }
        const page = yield* list("traces", { traceId: id, limit: 100 });
        if (page.items.length === 0) return undefined;
        const trace = (yield* rows(
          `${select} WHERE signal = 'trace' AND trace_id = ? ORDER BY id DESC LIMIT 1`,
          [id],
        ))[0];
        return {
          ...page,
          trace,
          spans: coalesceSpans(page.items.filter((item) => item.signal === "span")),
          records: page.items,
        };
      }),
    );
  });
  return { list, detail };
}

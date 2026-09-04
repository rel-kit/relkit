import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";
import type { ObservabilityRecord } from "../model.js";
import type { ObservabilityQueryRequest } from "../query-types.js";
import { response, validate } from "../query-validation.js";
import type { StoredLocalRecord } from "./types.js";
import {
  assembleRequestExecution,
  coalesceSpans,
  MAX_EXECUTION_RECORDS,
} from "../execution-assembly.js";

export function createDuckdbQuery(connection: DuckDBConnection) {
  const rows = async (sql: string, values: DuckDBValue[] = []): Promise<StoredLocalRecord[]> => {
    const result = await connection.runAndReadAll(sql, values);
    return result.getRowObjectsJson().map((item) => ({
      ...(JSON.parse(String(item.payload)) as ObservabilityRecord),
      cursor: String(item.cursor),
      origin: String(item.origin) as StoredLocalRecord["origin"],
    }));
  };
  const select = "SELECT id::VARCHAR AS cursor, payload::VARCHAR AS payload, origin FROM records";
  const list = async (
    kind: "logs" | "requests" | "traces",
    input: ObservabilityQueryRequest = {},
  ) => {
    const query = validate(input, 100);
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
    const found = distinctTraces
      ? await rows(
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
      : await rows(
          `${select} WHERE ${clauses.join(" AND ")} ORDER BY id ${descending ? "DESC" : "ASC"} LIMIT ?`,
          [...values, query.limit + 1],
        );
    const page = found.slice(0, query.limit);
    return response(page, found.length > query.limit ? page.at(-1)?.cursor : undefined);
  };
  const detail = async (kind: "log" | "request" | "trace", id: string) => {
    if (kind === "log") {
      validate({ cursor: id }, 100);
      const log = (await rows(`${select} WHERE id = ? AND signal = 'log'`, [BigInt(id)]))[0];
      return log ? { ...response([]), log } : undefined;
    }
    if (kind === "request") {
      const records = await rows(
        `${select} WHERE request_id = ? OR origin_request_id = ? OR trace_id IN
          (SELECT trace_id FROM records WHERE signal = 'request' AND request_id = ?)
          ORDER BY id DESC LIMIT ?`,
        [id, id, id, MAX_EXECUTION_RECORDS + 1],
      );
      const detail = assembleRequestExecution(records, id);
      if (!detail) return undefined;
      return {
        ...response([]),
        ...detail,
      };
    }
    const page = await list("traces", { traceId: id, limit: 100 });
    if (page.items.length === 0) return undefined;
    const trace = (
      await rows(`${select} WHERE signal = 'trace' AND trace_id = ? ORDER BY id DESC LIMIT 1`, [id])
    )[0];
    return {
      ...page,
      trace,
      spans: coalesceSpans(page.items.filter((item) => item.signal === "span")),
      records: page.items,
    };
  };
  return { list, detail };
}

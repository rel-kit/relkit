import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";
import type { ObservabilityRecord } from "../model.js";
import type { ObservabilityQueryRequest } from "../query-types.js";
import { response, validate } from "../query-validation.js";
import type { StoredLocalRecord } from "./types.js";

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
    if (query.cursor !== undefined) add(`id ${descending ? "<" : ">"} ?`, BigInt(query.cursor));
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
      traceId: "traceId",
      serviceId: "serviceId",
      generationId: "generationId",
      graphHash: "graphHash",
    })) {
      const value = query[key as keyof ObservabilityQueryRequest];
      if (typeof value === "string") add(`json_extract_string(payload, '$.${column}') = ?`, value);
    }
    if (query.requestId !== undefined) {
      clauses.push("(request_id = ? OR json_extract_string(payload, '$.correlationId') = ?)");
      values.push(query.requestId, query.requestId);
    }
    const found = await rows(
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
      const request = (
        await rows(
          `${select} WHERE signal = 'request' AND request_id = ? ORDER BY id DESC LIMIT 1`,
          [id],
        )
      )[0];
      if (!request) return undefined;
      const records = await rows(
        `${select} WHERE request_id = ? OR trace_id = ? ORDER BY id LIMIT 101`,
        [id, request.traceId ?? ""],
      );
      return {
        ...response([]),
        request,
        records: records.slice(0, 100),
        ...(records.length > 100 ? { nextCursor: records[99]?.cursor } : {}),
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
      spans: page.items.filter((item) => item.signal === "span"),
      records: page.items,
    };
  };
  return { list, detail };
}

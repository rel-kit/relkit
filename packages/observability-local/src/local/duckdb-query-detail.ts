/** Assembles request/log/trace detail from bounded serialized history reads. */
import { Effect } from "effect";
import {
  ObservabilityQueryError,
  assembleRequestExecution,
  coalesceSpans,
  MAX_EXECUTION_RECORDS,
} from "@relkit/observability";
import { response, validate } from "@relkit/observability/internal/query";
import { duckdbError } from "./duckdb-error.js";
import { duckdbQueryError } from "./duckdb-query-error.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import type { DuckdbReadRows } from "./duckdb-query-rows.types.js";
import type { makeDuckdbList } from "./duckdb-query-list.js";
const select = "SELECT id::VARCHAR AS cursor, payload::VARCHAR AS payload, origin FROM records";
/** @param rows - Serialized row reader. @param list - Validated trace list operation. @returns Lazy bounded detail operations. */
export function makeDuckdbDetail(rows: DuckdbReadRows, list: ReturnType<typeof makeDuckdbList>) {
  return Effect.fn("ObservabilityDuckdb.query.detail")(function* (
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
}

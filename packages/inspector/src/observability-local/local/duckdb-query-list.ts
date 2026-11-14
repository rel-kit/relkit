/**
 * Executes a validated list plan and emits versioned cursor pages over committed history. A query
 * that asks for `count` also gets `total`, the matching records across all pages, from a second
 * count query compiled with the same filters.
 */
import { Effect } from "effect";
import { countRequested, ObservabilityQueryError } from "relkit/observability";
import type { ObservabilityQueryRequest } from "relkit/observability";
import { response, validate } from "relkit/observability/query";
import { duckdbCountPlan, duckdbQueryPlan } from "./duckdb-query-plan.js";
import { duckdbError } from "./duckdb-error.js";
import { duckdbQueryError } from "./duckdb-query-error.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import type { DuckdbReadCount, DuckdbReadRows } from "./duckdb-query-rows.types.js";
/** @param rows - Serialized native reader. @param count - Serialized count reader. @returns Lazy list operation with database/query typed failures. */
export function makeDuckdbList(rows: DuckdbReadRows, count: DuckdbReadCount) {
  return Effect.fn("ObservabilityDuckdb.query.list")(function* (
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
        const plan = duckdbQueryPlan(kind, query);
        const found = yield* rows(plan.sql, plan.values);
        const page = found.slice(0, query.limit);
        const result = response(page, found.length > query.limit ? page.at(-1)?.cursor : undefined);
        if (!countRequested(query)) return result;
        const totalPlan = duckdbCountPlan(kind, query);
        return Object.freeze({ ...result, total: yield* count(totalPlan.sql, totalPlan.values) });
      }),
    );
  });
}

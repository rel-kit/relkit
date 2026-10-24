/** Executes a validated list plan and emits versioned cursor pages over committed history. */
import { Effect } from "effect";
import { ObservabilityQueryError } from "@relkit/observability";
import type { ObservabilityQueryRequest } from "@relkit/observability";
import { response, validate } from "@relkit/observability/internal/query";
import { duckdbQueryPlan } from "./duckdb-query-plan.js";
import { duckdbError } from "./duckdb-error.js";
import { duckdbQueryError } from "./duckdb-query-error.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import type { DuckdbReadRows } from "./duckdb-query-rows.types.js";
/** @param rows - Serialized native reader. @returns Lazy list operation with database/query typed failures. */
export function makeDuckdbList(rows: DuckdbReadRows) {
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
        return response(page, found.length > query.limit ? page.at(-1)?.cursor : undefined);
      }),
    );
  });
}

import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { openDuckdbDatabaseEffect } from "../src/local/duckdb-database-effect.js";
import { duckdbDriverLayer } from "../src/local/duckdb-driver.js";
import type { DuckdbConnectionPort } from "../src/local/duckdb-driver.types.js";
import { createDuckdbQuery } from "../src/local/duckdb-query.js";
import { ObservabilityQueryError } from "../src/query-types.js";
function connection(): DuckdbConnectionPort {
  return {
    run: async () => undefined,
    runAndReadAll: async (sql) => ({
      getRowObjectsJson: () =>
        sql.includes("pragma_table_info")
          ? [{ name: "origin_request_id" }, { name: "span_id" }]
          : [],
    }),
    closeSync: () => undefined,
  };
}
test("Effect append rolls back invalid batches and query validation stays tagged", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-duckdb-effect-transaction-"));
  try {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const database = yield* openDuckdbDatabaseEffect(root);
          const valid = {
            key: "same-key",
            origin: "application" as const,
            record: {
              version: 2 as const,
              signal: "log" as const,
              timestamp: "2026-09-25T00:00:00.000Z",
              level: "info" as const,
              component: "test",
              message: "transaction",
            },
          };
          const failed = yield* Effect.result(database.append([valid, { ...valid, key: "" }]));
          const before = yield* database.list("logs");
          const stored = yield* database.append([valid]);
          const rejected = yield* Effect.result(database.list("logs", { cursor: "invalid" }));
          return { failed, before, stored, rejected };
        }).pipe(Effect.provide(duckdbDriverLayer)),
      ),
    );
    expect(result.failed).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "DuckdbError",
        operation: "append",
      },
    });
    expect(result.before.items).toHaveLength(0);
    expect(result.stored).toHaveLength(1);
    expect(result.rejected).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "DuckdbQueryError",
        code: "RELKIT_OBSERVABILITY_QUERY_INVALID",
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Promise query adapter preserves query error codes", async () => {
  const query = createDuckdbQuery(connection());
  expect((await query.list("logs")).items).toEqual([]);
  await expect(query.list("logs", { cursor: "invalid" })).rejects.toMatchObject({
    name: "ObservabilityQueryError",
    code: "RELKIT_OBSERVABILITY_QUERY_INVALID",
  });
  await expect(query.detail("log", "invalid")).rejects.toBeInstanceOf(ObservabilityQueryError);
});

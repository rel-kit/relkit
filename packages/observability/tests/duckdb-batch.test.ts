import { expect, test } from "vitest";
import { Effect, Fiber, Semaphore } from "effect";
import type { DuckDBValue } from "@duckdb/node-api";
import { appendDuckdbBatchEffect } from "../src/local/duckdb-batch.js";
import { makeDuckdbStorage } from "../src/local/duckdb-storage.js";
import type { DuckdbConnectionPort } from "../src/local/duckdb-driver.types.js";
import type { LocalRecord } from "../src/local/types.types.js";

/** Builds a current, valid log envelope for deterministic transaction tests. */
function record(key: string, message = key): LocalRecord {
  return {
    key,
    origin: "application",
    record: {
      version: 2,
      signal: "log",
      timestamp: new Date().toISOString(),
      level: "info",
      component: "test",
      message,
      fields: {},
    },
  };
}

test("shuffled receipt and large sequence rows retain exact input-to-cursor mapping", async () => {
  const commands: string[] = [];
  let inserted: DuckDBValue[] | undefined;
  const connection: DuckdbConnectionPort = {
    run: async (sql, values) => {
      commands.push(sql);
      inserted = values;
    },
    runAndReadAll: async (sql) => {
      commands.push(sql);
      return {
        getRowObjectsJson: () =>
          sql.includes("RETURNING key")
            ? [{ key: "second" }, { key: "first" }]
            : [{ id: "9007199254741000" }, { id: "9007199254740999" }],
      };
    },
    closeSync: () => {},
  };
  const rows = await Effect.runPromise(
    appendDuckdbBatchEffect(
      connection,
      [record("first"), record("second"), record("first", "discarded")],
      Date.now(),
    ),
  );
  expect(rows).toMatchObject([
    { message: "first", cursor: "9007199254740999" },
    { message: "second", cursor: "9007199254741000" },
  ]);
  expect(commands).toHaveLength(3);
  expect(inserted?.[0]).toBe(9007199254740999n);
  expect(inserted?.[11]).toBe(9007199254741000n);
});

test("an invalid duplicate still fails before any native admission", async () => {
  const commands: string[] = [];
  const connection: DuckdbConnectionPort = {
    run: async (sql) => {
      commands.push(sql);
    },
    runAndReadAll: async (sql) => {
      commands.push(sql);
      return { getRowObjectsJson: () => [] };
    },
    closeSync: () => {},
  };
  const invalid: LocalRecord = {
    key: "same",
    origin: "application",
    record: {
      version: 2,
      signal: "log",
      timestamp: "invalid",
      level: "info",
      component: "test",
      message: "invalid",
      fields: {},
    },
  };
  const result = await Effect.runPromise(
    Effect.result(appendDuckdbBatchEffect(connection, [record("same"), invalid], Date.now())),
  );
  expect(result).toMatchObject({
    _tag: "Failure",
    failure: { _tag: "DuckdbError", operation: "append" },
  });
  expect(commands).toEqual([]);
});

test.each([
  { allocation: [] },
  { allocation: [{ id: "1" }, { id: "1" }] },
  { allocation: [{ id: "broken" }] },
  { allocation: [{ id: 1 }] },
  { allocation: [{ id: "-1" }] },
])(
  "invalid sequence allocation rolls back without publishing cursors: $allocation",
  async ({ allocation }) => {
    const commands: string[] = [];
    const connection: DuckdbConnectionPort = {
      run: async (sql) => {
        commands.push(sql);
      },
      runAndReadAll: async (sql) => ({
        getRowObjectsJson: () =>
          sql.includes("RETURNING key") ? [{ key: "allocation" }] : allocation,
      }),
      closeSync: () => {},
    };
    const storage = makeDuckdbStorage(connection, Semaphore.makeUnsafe(1), {});
    const result = await Effect.runPromise(Effect.result(storage.append([record("allocation")])));
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "DuckdbError", operation: "append" },
    });
    expect(commands).toEqual(["BEGIN TRANSACTION", "ROLLBACK"]);
  },
);

test("a native record-write failure rolls back receipt admission", async () => {
  const commands: string[] = [];
  const failure = new Error("write failed");
  const connection: DuckdbConnectionPort = {
    run: async (sql) => {
      commands.push(sql);
      if (sql.startsWith("INSERT INTO records")) throw failure;
    },
    runAndReadAll: async (sql) => ({
      getRowObjectsJson: () => (sql.includes("RETURNING key") ? [{ key: "write" }] : [{ id: "1" }]),
    }),
    closeSync: () => {},
  };
  const result = await Effect.runPromise(
    Effect.result(
      makeDuckdbStorage(connection, Semaphore.makeUnsafe(1), {}).append([record("write")]),
    ),
  );
  expect(result).toMatchObject({ _tag: "Failure", failure: { cause: failure } });
  expect(commands.at(-1)).toBe("ROLLBACK");
  expect(commands).not.toContain("COMMIT");
});

test("interruption waits for a physical bulk write before rollback and release", async () => {
  const events: string[] = [];
  const started = Promise.withResolvers<void>();
  const settled = Promise.withResolvers<void>();
  const connection: DuckdbConnectionPort = {
    run: async (sql) => {
      if (sql.startsWith("INSERT INTO records")) {
        events.push("native.begin");
        started.resolve();
        await settled.promise;
        events.push("native.end");
      } else events.push(sql);
    },
    runAndReadAll: async (sql) => ({
      getRowObjectsJson: () =>
        sql.includes("RETURNING key") ? [{ key: "interrupt" }] : [{ id: "1" }],
    }),
    closeSync: () => {
      events.push("close");
    },
  };
  const fiber = Effect.runFork(
    Effect.scoped(
      Effect.acquireRelease(Effect.succeed(connection), (owned) =>
        Effect.sync(() => owned.closeSync()),
      ).pipe(
        Effect.flatMap((owned) =>
          makeDuckdbStorage(owned, Semaphore.makeUnsafe(1), {}).append([record("interrupt")]),
        ),
      ),
    ),
  );
  await started.promise;
  const stopped = Effect.runPromise(Fiber.interrupt(fiber));
  await Promise.resolve();
  expect(events).toEqual(["BEGIN TRANSACTION", "native.begin"]);
  settled.resolve();
  await stopped;
  expect(events).toEqual(["BEGIN TRANSACTION", "native.begin", "native.end", "ROLLBACK", "close"]);
});

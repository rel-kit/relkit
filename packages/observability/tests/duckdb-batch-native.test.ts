import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DuckDBInstance } from "@duckdb/node-api";
import { Effect, Semaphore } from "effect";
import { initializeDuckdbSchema } from "../src/local/duckdb-schema.js";
import { makeDuckdbStorage } from "../src/local/duckdb-storage.js";
import type { DuckdbConnectionPort } from "../src/local/duckdb-driver.types.js";
import type { LocalRecord } from "../src/local/types.types.js";

/**
 * Builds distinct current log records for the actual native storage boundary.
 * @param key - Globally deduplicated transport key.
 * @param message - Record payload used to distinguish duplicate candidates.
 * @param origin - Source whose first admitted record retains ownership.
 * @returns A valid current log envelope.
 */
function record(
  key: string,
  message = key,
  origin: LocalRecord["origin"] = "application",
): LocalRecord {
  return {
    key,
    origin,
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

/**
 * Owns the directory, instance and connection immediately after each acquisition.
 * @param run - Native assertions completed before releasing the connection.
 * @returns After all handles and the temporary directory are released.
 */
async function withDatabase(
  run: (connection: DuckdbConnectionPort) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "relkit-duckdb-batch-native-"));
  try {
    const instance = await DuckDBInstance.create(join(root, "observability.duckdb"));
    try {
      const connection = await instance.connect();
      try {
        await Effect.runPromise(initializeDuckdbSchema(connection));
        await run(connection);
      } finally {
        connection.closeSync();
      }
    } finally {
      instance.closeSync();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("native bulk inserts preserve first-wins keys, ordered cursors, retries and the 256 bound", async () =>
  withDatabase(async (connection) => {
    const storage = makeDuckdbStorage(connection, Semaphore.makeUnsafe(1), {});
    const original = Array.from({ length: 255 }, (_, index) => record("key:" + index));
    const stored = await Effect.runPromise(
      storage.append([
        original[0] ?? record("missing"),
        record("key:0", "discarded", "relkit"),
        ...original.slice(1),
      ]),
    );
    expect(stored).toHaveLength(255);
    expect(stored.map((value) => value.cursor)).toEqual(
      Array.from({ length: 255 }, (_, index) => String(index + 1)),
    );
    expect(stored[0]).toMatchObject({ origin: "application", message: "key:0" });
    expect(
      await Effect.runPromise(
        storage.append([record("key:0", "retry", "inspector"), record("last", "fresh", "relkit")]),
      ),
    ).toMatchObject([{ cursor: "256", message: "fresh", origin: "relkit" }]);
    expect(await Effect.runPromise(storage.append(original))).toEqual([]);
    const oversized = await Effect.runPromise(
      Effect.result(
        storage.append(Array.from({ length: 257 }, (_, index) => record("oversized:" + index))),
      ),
    );
    expect(oversized).toMatchObject({ _tag: "Failure", failure: { _tag: "DuckdbError" } });
    await Effect.runPromise(storage.flush());
    expect(
      (
        await connection.runAndReadAll("SELECT count(*)::INTEGER AS count FROM records")
      ).getRowObjectsJson(),
    ).toEqual([{ count: 256 }]);
    expect(
      (
        await connection.runAndReadAll("SELECT count(*)::INTEGER AS count FROM receipts")
      ).getRowObjectsJson(),
    ).toEqual([{ count: 256 }]);
  }));

test("invalid duplicates roll back the entire native transaction", async () =>
  withDatabase(async (connection) => {
    const invalid: LocalRecord = {
      key: "duplicate",
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
      Effect.result(
        makeDuckdbStorage(connection, Semaphore.makeUnsafe(1), {}).append([
          record("earlier"),
          record("duplicate"),
          invalid,
        ]),
      ),
    );
    expect(result).toMatchObject({ _tag: "Failure", failure: { _tag: "DuckdbError" } });
    for (const table of ["records", "receipts"])
      expect(
        (
          await connection.runAndReadAll("SELECT count(*)::INTEGER AS count FROM " + table)
        ).getRowObjectsJson(),
      ).toEqual([{ count: 0 }]);
  }));

test("native record constraint failures and failed commits roll back admitted receipts", async () =>
  withDatabase(async (connection) => {
    const permit = Semaphore.makeUnsafe(1);
    await Effect.runPromise(makeDuckdbStorage(connection, permit, {}).append([record("seed")]));
    for (const fault of ["record", "commit"]) {
      const injected: DuckdbConnectionPort = {
        run: async (sql, values) => {
          if (fault === "commit" && sql === "COMMIT") throw new Error("commit rejected");
          return connection.run(sql, values);
        },
        runAndReadAll: async (sql, values) =>
          fault === "record" && sql.includes("SELECT nextval")
            ? { getRowObjectsJson: () => [{ id: "1" }] }
            : connection.runAndReadAll(sql, values),
        closeSync: () => {},
      };
      const result = await Effect.runPromise(
        Effect.result(makeDuckdbStorage(injected, permit, {}).append([record("failed:" + fault)])),
      );
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "DuckdbError", operation: fault === "record" ? "append" : "commit" },
      });
      for (const table of ["records", "receipts"])
        expect(
          (
            await connection.runAndReadAll("SELECT count(*)::INTEGER AS count FROM " + table)
          ).getRowObjectsJson(),
        ).toEqual([{ count: 1 }]);
    }
    expect(
      await Effect.runPromise(
        makeDuckdbStorage(connection, permit, {}).append([
          record("failed:record"),
          record("failed:commit"),
        ]),
      ),
    ).toHaveLength(2);
  }));

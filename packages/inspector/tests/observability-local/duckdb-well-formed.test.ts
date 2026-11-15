/**
 * A JavaScript string may hold an unpaired surrogate, for example from a JSON body that escapes
 * `\ud800`. DuckDB's JSON column refuses such text, and a refused record made every later append of
 * its batch fail, so collection stalled until the application session changed. History stores the
 * text with U+FFFD in place of each unpaired surrogate instead.
 */
import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DuckDBInstance } from "@duckdb/node-api";
import { Effect, Semaphore } from "effect";
import type { LocalRecord } from "relkit/observability/local/record";
import { initializeDuckdbSchema } from "../../src/observability-local/local/duckdb-schema.js";
import { makeDuckdbStorage } from "../../src/observability-local/local/duckdb-storage.js";
import { wellFormedValue } from "../../src/observability-local/local/well-formed.js";

/** A log record whose message, field name and field value carry the given text. */
function record(key: string, text: string): LocalRecord {
  return {
    key,
    origin: "application",
    record: {
      version: 2,
      signal: "log",
      timestamp: new Date().toISOString(),
      level: "info",
      component: "items",
      message: `item ${text}`,
      fields: { name: text, [`key ${text}`]: [text, { nested: text }] },
    },
  };
}

test("unpaired surrogates become U+FFFD; paired ones and other text are unchanged", () => {
  expect(wellFormedValue("a\ud800b\udc00c")).toBe("a�b�c");
  expect(wellFormedValue("😀 ok \u0000")).toBe("😀 ok \u0000");
  expect(wellFormedValue({ ["k\udbff"]: ["\udfff", 1, null, true] })).toEqual({
    ["k�"]: ["�", 1, null, true],
  });
});

test("a record with an unpaired surrogate is stored, and the rest of its batch with it", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-duckdb-well-formed-"));
  try {
    const instance = await DuckDBInstance.create(join(root, "observability.duckdb"));
    const connection = await instance.connect();
    try {
      await Effect.runPromise(initializeDuckdbSchema(connection));
      const storage = makeDuckdbStorage(connection, Semaphore.makeUnsafe(1), {});
      const stored = await Effect.runPromise(
        storage.append([record("before", "plain"), record("lone", "a\ud800b"), record("after", "x")]),
      );
      expect(stored).toHaveLength(3);
      const rows = (
        await connection.runAndReadAll(
          "SELECT payload->>'message' AS message, payload->'fields'->>'name' AS name FROM records ORDER BY id",
        )
      ).getRowObjectsJson();
      expect(rows).toEqual([
        { message: "item plain", name: "plain" },
        { message: "item a�b", name: "a�b" },
        { message: "item x", name: "x" },
      ]);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

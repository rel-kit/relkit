/** Seeds the pre-extraction history schema independently of the new store implementation. */
import { DuckDBInstance } from "@duckdb/node-api";
import { join } from "node:path";

/** @param root - Private fixture directory. @returns A seeded existing history database after native handles close. */
export async function seedExistingHistory(root: string): Promise<void> {
  const instance = await DuckDBInstance.create(join(root, "observability.duckdb"));
  const connection = await instance.connect();
  try {
    await connection.run(`
      CREATE SEQUENCE record_ids START 42;
      CREATE TABLE records (
        id BIGINT PRIMARY KEY DEFAULT nextval('record_ids'), origin VARCHAR NOT NULL,
        signal VARCHAR NOT NULL, recorded_at BIGINT NOT NULL, received_at BIGINT NOT NULL,
        request_id VARCHAR, origin_request_id VARCHAR, trace_id VARCHAR, span_id VARCHAR,
        bytes BIGINT NOT NULL, payload JSON NOT NULL
      );
      CREATE TABLE receipts (key VARCHAR PRIMARY KEY, received_at BIGINT NOT NULL);
      CREATE TABLE imports (source VARCHAR PRIMARY KEY, malformed BIGINT NOT NULL);
    `);
    const record = JSON.stringify({
      version: 2,
      signal: "log",
      timestamp: "2026-09-25T00:00:00.000Z",
      level: "info",
      component: "existing",
      message: "retained history",
      fields: {},
    });
    await connection.run(
      "INSERT INTO records VALUES (41, 'application', 'log', 1790294400000, 1790294400000, NULL, NULL, NULL, NULL, ?, ?)",
      [Buffer.byteLength(record), record],
    );
    await connection.run("INSERT INTO receipts VALUES ('original:41', ?)", [Date.now()]);
    await connection.run("INSERT INTO imports VALUES ('existing-source:hash', 3)");
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

/** @param root - Existing history root. @returns Schema and preserved source markers from independent native reads. */
export async function inspectExistingHistory(root: string) {
  const instance = await DuckDBInstance.create(join(root, "observability.duckdb"));
  const connection = await instance.connect();
  try {
    const columns = (
      await connection.runAndReadAll(
        "SELECT name, type FROM pragma_table_info('records') ORDER BY cid",
      )
    ).getRowObjectsJson();
    const imports = (
      await connection.runAndReadAll("SELECT * FROM imports ORDER BY source")
    ).getRowObjectsJson();
    const receipts = (
      await connection.runAndReadAll("SELECT key FROM receipts WHERE key = 'original:41'")
    ).getRowObjectsJson();
    return { columns, imports, receipts };
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

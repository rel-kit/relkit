import { expect, test } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { importLocalHistory } from "../src/local/import-history.js";
import type { LocalRecord, StoredLocalRecord } from "../src/local/types.js";
test("legacy import accounts for malformed lines and skips a repeated file", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-import-history-"));
  const directory = join(root, "logs", "2026-09-25");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "segment-000001.ndjson"),
    [
      JSON.stringify({
        version: 2,
        signal: "log",
        timestamp: "2026-09-25T00:00:00.000Z",
        level: "info",
        component: "test",
        message: "legacy",
      }),
      "not json",
      "",
    ].join("\n"),
  );
  const instance = await DuckDBInstance.create(join(root, "import.duckdb"));
  const connection = await instance.connect();
  try {
    await connection.run("CREATE TABLE imports (source VARCHAR PRIMARY KEY, malformed BIGINT)");
    await connection.run("CREATE TABLE receipts (key VARCHAR PRIMARY KEY)");
    const seen: string[] = [];
    const append = async (records: readonly LocalRecord[]): Promise<readonly StoredLocalRecord[]> =>
      records.map((item, index) => {
        seen.push(item.key);
        return { ...item.record, cursor: String(index + 1), origin: item.origin };
      });
    expect(await importLocalHistory(root, connection, append)).toEqual({
      records: 1,
      malformed: 1,
    });
    expect(await importLocalHistory(root, connection, append)).toEqual({
      records: 0,
      malformed: 0,
    });
    expect(seen).toHaveLength(1);
  } finally {
    connection.closeSync();
    instance.closeSync();
    await rm(root, { recursive: true, force: true });
  }
});

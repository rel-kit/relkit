import { expect, test } from "vitest";
import { appendFile, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { openDuckdbDatabase } from "../src/local/duckdb-database.js";
test("direct DuckDB adapter appends, queries, and closes owned handles", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-duckdb-direct-"));
  try {
    const database = await openDuckdbDatabase(root);
    const stored = await database.append([
      {
        key: "direct:1",
        origin: "application",
        record: {
          version: 2,
          signal: "log",
          timestamp: "2026-09-25T00:00:00.000Z",
          level: "info",
          component: "test",
          message: "direct",
        },
      },
    ]);
    expect(stored).toMatchObject([{ cursor: "1", message: "direct" }]);
    expect((await database.list("logs")).items).toHaveLength(1);
    expect(await database.detail("log", "1")).toMatchObject({ log: { message: "direct" } });
    await database.close();
    await database.close();
    await expect(database.list("logs")).rejects.toMatchObject({
      _tag: "DuckdbError",
      operation: "closed",
    });
    const reopened = await openDuckdbDatabase(root);
    expect((await reopened.list("logs")).items).toHaveLength(1);
    await reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("schema setup failure releases DuckDB before another open", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-duckdb-invalid-"));
  const path = join(root, "observability.duckdb");
  try {
    const instance = await DuckDBInstance.create(path);
    const connection = await instance.connect();
    await connection.run("CREATE TABLE records (id INTEGER)");
    connection.closeSync();
    instance.closeSync();
    await expect(openDuckdbDatabase(root)).rejects.toThrow();
    const next = await DuckDBInstance.create(path);
    const nextConnection = await next.connect();
    try {
      expect(
        (
          await nextConnection.runAndReadAll("SELECT count(*) AS count FROM records")
        ).getRowObjectsJson()[0],
      ).toMatchObject({ count: "0" });
    } finally {
      nextConnection.closeSync();
      next.closeSync();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("open imports legacy segments once as an active file grows", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-duckdb-legacy-"));
  const directory = join(root, "logs", "2026-09-25");
  const path = join(directory, "segment-000001.active.ndjson");
  const line = (message: string) =>
    JSON.stringify({
      version: 2,
      signal: "log",
      timestamp: "2026-09-25T00:00:00.000Z",
      level: "info",
      component: "test",
      message,
    });
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path, `${line("first")}\n`);
    const first = await openDuckdbDatabase(root);
    expect(first.imported).toEqual({ records: 1, malformed: 0 });
    expect((await first.list("logs")).items).toHaveLength(1);
    await first.close();
    await appendFile(path, `${line("second")}\n`);
    const second = await openDuckdbDatabase(root);
    expect(second.imported).toEqual({ records: 1, malformed: 0 });
    expect((await second.list("logs")).items).toHaveLength(2);
    await second.close();
    await rename(path, path.replace(".active.ndjson", ".ndjson"));
    const unchanged = await openDuckdbDatabase(root);
    expect(unchanged.imported).toEqual({ records: 0, malformed: 0 });
    expect((await unchanged.list("logs")).items).toHaveLength(2);
    await unchanged.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

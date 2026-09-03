import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalWorker } from "./src/local/worker-client";
import type { ObservabilityQueryPage } from "./src/query-types";
import type { StoredLocalRecord } from "./src/local/types";

test("a committed partial import resumes without duplicating its first batch", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-import-recovery-"));
  const worker = startLocalWorker();
  try {
    const script = `
      import { writeFile } from "node:fs/promises";
      import { DuckDBInstance } from "@duckdb/node-api";
      import { openDuckdbDatabase } from "./dist/local/duckdb-database.js";
      import { importLocalHistory } from "./dist/local/import-history.js";
      const root = process.argv[1];
      const database = await openDuckdbDatabase(root);
      const instance = await DuckDBInstance.create(root + "/observability.duckdb");
      const connection = await instance.connect();
      await writeFile(root + "/history.ndjson", Array.from({ length: 300 }, () => JSON.stringify({ version: 1, signal: "log", level: "info", timestamp: new Date().toISOString(), component: "import", message: "Repeated record", fields: {} })).join("\\n"));
      try { await importLocalHistory(root, connection, async (records) => { await database.append(records); throw new Error("interrupted after commit"); }); }
      catch (error) { if (!String(error).includes("interrupted after commit")) throw error; }
      connection.closeSync(); instance.closeSync(); await database.close();
    `;
    const process = Bun.spawn(["node", "--input-type=module", "-e", script, root], {
      cwd: import.meta.dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, error] = await Promise.all([process.exited, new Response(process.stderr).text()]);
    expect(error).toBe("");
    expect(code).toBe(0);
    expect(await worker.call({ type: "open", root })).toEqual({ records: 44, malformed: 0 });
    let cursor: string | undefined;
    const ids = new Set<string>();
    do {
      const page = await worker.call<ObservabilityQueryPage<StoredLocalRecord>>({
        type: "query",
        kind: "logs",
        query: { limit: 100, ...(cursor ? { cursor } : {}) },
      });
      for (const item of page.items) ids.add(item.cursor);
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids.size).toBe(300);
  } finally {
    await worker.close();
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("unexpected worker exit fails pending/future work and requests a session restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-worker-failure-"));
  let failure: Error | undefined;
  const worker = startLocalWorker((error) => {
    failure = error;
  });
  try {
    await worker.call({ type: "open", root });
    await worker.call({ type: "close" });
    for (let attempt = 0; attempt < 100 && !failure; attempt++) await Bun.sleep(10);
    expect(failure?.message).toContain("Telemetry worker exited");
    await expect(worker.call({ type: "query", kind: "logs", query: {} })).rejects.toThrow();
  } finally {
    await worker.close();
    await rm(root, { recursive: true, force: true });
  }
});

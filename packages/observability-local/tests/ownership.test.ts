/**
 * Verifies preserved existing history, real packaged worker assets and application
 * execution with no native store installed. Temporary consumers own every process.
 */
import { expect, test } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createObservabilityRuntime } from "@relkit/observability";
import { openDuckdbDatabase } from "../src/local/duckdb-database.js";
import { withPackedConsumer, packedCommand } from "./packed-consumer.js";
import { seedExistingHistory, inspectExistingHistory } from "./ownership-history.js";
import { packedWorkerProgram } from "./packed-worker-program.js";

test("existing_history_readable", async () => {
  const root = await mkdtemp("/tmp/relkit-existing-history-");
  try {
    await seedExistingHistory(root);
    const before = await inspectExistingHistory(root);
    const database = await openDuckdbDatabase(root, { maxAgeMs: Number.MAX_SAFE_INTEGER });
    try {
      expect((await database.list("logs")).items).toMatchObject([
        { cursor: "41", message: "retained history" },
      ]);
      expect(database.imported).toEqual({ records: 0, malformed: 0 });
    } finally {
      await database.close();
    }
    expect(await inspectExistingHistory(root)).toEqual(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("console_without_storage", async () => {
  const root = await mkdtemp("/tmp/relkit-console-no-store-");
  const history = join(root, "uncreated-history");
  const runtime = await createObservabilityRuntime({ root: history });
  try {
    runtime.collect({
      version: 2,
      signal: "log",
      timestamp: new Date().toISOString(),
      level: "info",
      component: "console",
      message: "usable",
      fields: {},
    });
    expect((await runtime.query.logs()).items).toMatchObject([{ message: "usable" }]);
    expect(existsSync(history)).toBe(false);
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("production_no_duckdb", async () => {
  await withPackedConsumer(["contracts", "observability"], async (root) => {
    const installed = await packedCommand(["bun", "pm", "ls", "--all"], root);
    expect(installed).not.toContain("@duckdb/");
    expect(existsSync(join(root, "node_modules/@duckdb"))).toBe(false);
    const assets = await readdir(join(root, "node_modules/@relkit/observability/dist/local"));
    expect(
      assets.some((name) =>
        /^(?:duckdb-|import-history|worker-client-(?:effect|service))/.test(name),
      ),
    ).toBe(false);
    await writeFile(
      join(root, "production.ts"),
      `
      import { createObservabilityRuntime } from "@relkit/observability";
      const runtime = await createObservabilityRuntime({ root: "must-not-exist" });
      runtime.collect({ version: 2, signal: "log", timestamp: new Date().toISOString(), level: "info", component: "production", message: "ready", fields: {} });
      if ((await runtime.query.logs()).items.length !== 1) throw new Error("Missing application record");
      await runtime.close();
    `,
    );
    await packedCommand(
      ["bun", "build", "./production.ts", "--target=bun", "--outfile=production.js"],
      root,
    );
    const artifact = await readFile(join(root, "production.js"), "utf8");
    expect(artifact).not.toMatch(/@duckdb\/|duckdb-worker|startLocalWorkerEffect/);
    await packedCommand(["bun", "./production.js"], root);
    expect(existsSync(join(root, "must-not-exist"))).toBe(false);
  });
}, 60_000);

test("driver_worker_assets_pack", async () => {
  await withPackedConsumer(["contracts", "observability", "observability-local"], async (root) => {
    expect(
      existsSync(
        join(root, "node_modules/@relkit/observability-local/dist/local/duckdb-worker.js"),
      ),
    ).toBe(true);
    const history = join(root, "history");
    await mkdir(history);
    await seedExistingHistory(history);
    const before = await inspectExistingHistory(history);
    expect(existsSync(join(root, "fresh-history/observability.duckdb"))).toBe(false);
    await writeFile(join(root, "worker.mjs"), packedWorkerProgram);
    console.info((await packedCommand(["node", "worker.mjs"], root)).trim());
    expect(existsSync(join(root, "fresh-history/observability.duckdb"))).toBe(true);
    expect(existsSync(join(root, "history/observability.duckdb"))).toBe(true);
    expect(await inspectExistingHistory(history)).toEqual(before);
  });
}, 60_000);

/**
 * Exercises the default application runtime without filesystem persistence.
 * A root remains diagnostic metadata; explicit storage owns historical writes.
 */
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createObservabilityRuntime } from "../src/runtime.js";
import manifest from "../package.json";

test("application installation excludes the native history driver", () => {
  expect(Object.keys(manifest.dependencies)).not.toContain("@duckdb/node-api");
});

test("console runtime keeps bounded queryable records without creating storage", async () => {
  const directory = await mkdtemp("/tmp/relkit-memory-ownership-");
  const root = join(directory, "unused-history");
  const runtime = await createObservabilityRuntime({ root, maxRecords: 2 });
  try {
    for (const message of ["first", "second", "third"]) {
      runtime.collect({
        version: 2,
        signal: "log",
        timestamp: new Date().toISOString(),
        level: "info",
        component: "ownership",
        message,
        fields: { password: "private" },
      });
    }
    await runtime.flush();
    expect(existsSync(root)).toBe(false);
    expect(
      (await runtime.query.logs({ order: "desc" })).items.map((record) => record.message),
    ).toEqual(["third", "second"]);
    expect(JSON.stringify(runtime.readRecords())).not.toContain("private");
  } finally {
    await runtime.close();
    await rm(directory, { recursive: true, force: true });
  }
});

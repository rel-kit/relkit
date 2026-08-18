import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { createObservabilityIndex, createObservabilitySegmentStore } from "./src/index.ts";

const roots: string[] = [];
const NOW = Date.parse("2026-08-16T12:00:00.000Z");

test("updates an atomic bounded index and paginates by offsets", async () => {
  const root = await makeRoot();
  const index = await createObservabilityIndex({
    root,
    now: () => NOW,
    retention: { maxAgeMs: 30 * 86_400_000, maxBytes: 1_000_000, maxEntries: 10 },
    maxPageSize: 2,
  });
  const store = await createObservabilitySegmentStore({
    root,
    maxRecordsPerSegment: 1,
    index,
  });
  await store.append(log("first", "2026-08-16T00:00:00.000Z", { token: "secret" }));
  await store.append(log("second", "2026-08-16T00:00:00.001Z"));
  await store.shutdown();

  const firstPage = index.page({ signal: "log", limit: 1 });
  expect(firstPage.entries).toHaveLength(1);
  expect(firstPage.nextCursor).toBeDefined();
  const first = firstPage.entries[0];
  if (first === undefined) throw new Error("index page is empty");
  const restored = await index.read(first);
  expect(restored).toMatchObject({ message: "first" });
  expect(JSON.stringify(restored)).not.toContain("secret");
  const secondPage = index.page({ signal: "log", cursor: first.cursor, limit: 1 });
  expect(secondPage.entries).toHaveLength(1);
  expect(index.stats().records).toBe(2);

  const stored = JSON.parse(await readFile(join(root, "index", "index.json"), "utf8")) as {
    readonly entries: readonly unknown[];
  };
  expect(stored.entries).toHaveLength(2);
  expect(await readdir(join(root, "index"))).toEqual(["index.json"]);
  await index.close();
});

test("rebuilds from valid segments and deletes old segments by age", async () => {
  const root = await makeRoot();
  const store = await createObservabilitySegmentStore({ root, maxRecordsPerSegment: 1 });
  await store.append(log("old", "2026-08-10T00:00:00.000Z"));
  await store.append(log("new", "2026-08-16T00:00:00.000Z"));
  await store.shutdown();

  const index = await createObservabilityIndex({
    root,
    now: () => NOW,
    retention: { maxAgeMs: 2 * 86_400_000, maxBytes: 1_000_000, maxEntries: 10 },
  });
  const page = index.page({ signal: "log", limit: 10 });
  expect(page.entries).toHaveLength(1);
  expect(await index.read(page.entries[0]!)).toMatchObject({ message: "new" });
  expect(index.stats().segments).toBe(1);
  await index.close();
});

test("deletes oldest finalized segments when total bytes exceed the bound", async () => {
  const root = await makeRoot();
  const store = await createObservabilitySegmentStore({ root, maxRecordsPerSegment: 1 });
  await store.append(log("old", "2026-08-16T00:00:00.000Z"));
  await store.append(log("new", "2026-08-16T00:00:00.001Z"));
  await store.shutdown();
  const directory = join(root, "logs", "2026-08-16");
  const files = (await readdir(directory)).sort();
  const newestBytes = (await stat(join(directory, files[1]!))).size;

  const index = await createObservabilityIndex({
    root,
    now: () => NOW,
    retention: { maxAgeMs: 30 * 86_400_000, maxBytes: newestBytes, maxEntries: 10 },
  });
  expect(index.stats().segments).toBe(1);
  expect(await index.read(index.page({ signal: "log" }).entries[0]!)).toMatchObject({
    message: "new",
  });
  await index.close();
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function log(message: string, timestamp: string, fields: Record<string, string> = {}) {
  return {
    version: 1 as const,
    signal: "log" as const,
    timestamp,
    level: "info" as const,
    component: "test",
    message,
    fields,
  };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join("/tmp", "zsys-observability-index-"));
  roots.push(root);
  return root;
}

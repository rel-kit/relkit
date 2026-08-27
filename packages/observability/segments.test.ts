import { afterEach, expect, test } from "bun:test";
import { appendFile, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createObservabilitySegmentStore } from "./src/index.ts";

const roots: string[] = [];

test("writes redacted versioned records, rotates atomically, and shuts down cleanly", async () => {
  const root = await makeRoot();
  const store = await createObservabilitySegmentStore({ root, maxRecordsPerSegment: 1 });
  await store.append({
    version: 1,
    signal: "log",
    timestamp: "2026-08-16T00:00:00.000Z",
    level: "info",
    component: "test",
    message: "first",
    fields: { token: "not-written" },
  });
  await store.append({
    version: 1,
    signal: "log",
    timestamp: "2026-08-16T00:00:00.001Z",
    level: "info",
    component: "test",
    message: "second",
    fields: {},
  });
  await store.shutdown();

  const files = (await readdir(join(root, "logs", "2026-08-16"))).sort();
  expect(files).toEqual(["segment-000001.ndjson", "segment-000002.ndjson"]);
  const contents = await Promise.all(
    files.map((file) => readFile(join(root, "logs", "2026-08-16", file), "utf8")),
  );
  expect(contents.join("")).not.toContain("not-written");
  expect(contents.join("")).toContain('"version":1');
});

test("repairs a malformed tail and quarantines it on startup", async () => {
  const root = await makeRoot();
  const store = await createObservabilitySegmentStore({ root });
  await store.append({
    version: 1,
    signal: "request",
    requestId: "request-1",
    traceId: "trace-1",
    generationId: "generation-1",
    graphHash: "sha256:test",
    invocationId: "invocation-1",
    startedAt: "2026-08-16T00:00:00.000Z",
    completedAt: "2026-08-16T00:00:00.001Z",
    durationMs: 1,
    method: "GET",
    rawPath: "/health",
    normalizedRoute: "/health",
    routeId: "health",
    functionId: "health.check",
    status: 200,
    outcome: "success",
    timeline: [],
  });
  await store.shutdown();
  const segment = join(root, "requests", "2026-08-16", "segment-000001.ndjson");
  await appendFile(segment, '{"version":1,"signal":"request"');

  const reopened = await createObservabilitySegmentStore({ root });
  await reopened.shutdown();
  expect((await readFile(segment, "utf8")).trim().split("\n")).toHaveLength(1);
  expect(await readdir(join(root, ".relkit-quarantine"))).toHaveLength(1);
});

test("exposes the named rotation failure point without losing the active segment", async () => {
  const root = await makeRoot();
  let failed = false;
  const store = await createObservabilitySegmentStore({
    root,
    maxRecordsPerSegment: 1,
    onFailure: (point) => {
      expect(point).toBe("observability.during-segment-rotation");
      if (!failed) {
        failed = true;
        throw new Error("rotation failed");
      }
    },
  });
  const record = (message: string) => ({
    version: 1 as const,
    signal: "log" as const,
    timestamp: "2026-08-16T00:00:00.000Z",
    level: "info" as const,
    component: "test",
    message,
    fields: {},
  });
  await store.append(record("first"));
  await expect(store.append(record("second"))).rejects.toThrow("rotation failed");
  await store.append(record("second"));
  await store.shutdown();
  expect(failed).toBe(true);
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join("/tmp", "relkit-observability-"));
  roots.push(root);
  return root;
}

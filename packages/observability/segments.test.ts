import { afterEach, expect, test } from "bun:test";
import { appendFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createObservabilitySegmentStore } from "./src/index.ts";

const roots: string[] = [];

test("writes redacted versioned records, rotates atomically, and shuts down cleanly", async () => {
  const root = await makeRoot();
  const store = await createObservabilitySegmentStore({ root, maxRecordsPerSegment: 1 });
  await store.append({
    version: 2,
    signal: "log",
    timestamp: "2026-08-16T00:00:00.000Z",
    level: "info",
    component: "test",
    message: "first",
    fields: { token: "not-written" },
  });
  await store.append({
    version: 2,
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
  expect(contents.join("")).toContain('"version":2');
});

test("repairs a malformed tail and quarantines it on startup", async () => {
  const root = await makeRoot();
  const store = await createObservabilitySegmentStore({ root });
  await store.append({
    version: 2,
    signal: "request",
    phase: "completed",
    requestId: "request-1",
    originRequestId: "request-1",
    traceId: "10000000000000000000000000000001",
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
  });
  await store.shutdown();
  const segment = join(root, "requests", "2026-08-16", "segment-000001.ndjson");
  await appendFile(segment, '{"version":1,"signal":"request"');

  const reopened = await createObservabilitySegmentStore({ root });
  await reopened.shutdown();
  expect((await readFile(segment, "utf8")).trim().split("\n")).toHaveLength(1);
  expect(await readdir(join(root, ".relkit-quarantine"))).toHaveLength(1);
});

test("reports incompatible state without rewriting the segment", async () => {
  const root = await makeRoot();
  const day = join(root, "requests", "2026-08-16");
  const segment = join(day, "segment-000001.ndjson");
  await mkdir(day, { recursive: true });
  await writeFile(segment, '{"version":1,"signal":"request"}\n');

  await expect(createObservabilitySegmentStore({ root })).rejects.toThrow(
    "RELKIT_OBSERVABILITY_STATE_INCOMPATIBLE",
  );
  expect(await readFile(segment, "utf8")).toBe('{"version":1,"signal":"request"}\n');
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
    version: 2 as const,
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

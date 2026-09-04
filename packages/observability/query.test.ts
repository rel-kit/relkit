import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createObservabilityIndex,
  createObservabilityQuery,
  createObservabilitySegmentStore,
} from "./src/index.ts";

const roots: string[] = [];

test("paginates stable redacted logs and applies time/severity filters", async () => {
  const root = await makeRoot();
  const index = await createObservabilityIndex({ root, maxPageSize: 2, maxEntries: 20 });
  const store = await createObservabilitySegmentStore({ root, index });
  await store.append(log("first", "2026-08-16T00:00:00.000Z", "info"));
  await store.append(log("second", "2026-08-16T00:00:00.001Z", "error"));
  await store.append(log("third", "2026-08-16T00:00:00.002Z", "error"));
  const query = createObservabilityQuery(index, { maxPageSize: 2 });

  const first = await query.logs({ limit: 1 });
  const second = await query.logs({ cursor: first.nextCursor, limit: 1 });
  const filtered = await query.logs({
    from: "2026-08-16T00:00:00.001Z",
    to: "2026-08-16T00:00:00.002Z",
    severity: "error",
  });

  expect(first.items.map((item) => item.message)).toEqual(["first"]);
  expect(second.items.map((item) => item.message)).toEqual(["second"]);
  expect(filtered.items.map((item) => item.message)).toEqual(["second", "third"]);
  expect(JSON.stringify(first)).not.toContain("top-secret-token");
  expect(first.protocol).toBe("relkit.observability.query");
  await store.shutdown();
  await index.close();
});

test("filters correlated requests and returns redacted request/trace details", async () => {
  const root = await makeRoot();
  const index = await createObservabilityIndex({ root, maxEntries: 20 });
  const store = await createObservabilitySegmentStore({ root, index });
  const traceId = "10000000000000000000000000000001";
  await store.append({
    ...request("request-1", traceId, "orders.create", "success"),
    phase: "started",
    invocationId: undefined,
    completedAt: undefined,
    durationMs: undefined,
    status: undefined,
    outcome: undefined,
  });
  await store.append(request("request-1", traceId, "orders.create", "success"));
  await store.append({
    version: 2,
    signal: "log",
    timestamp: "2026-08-16T00:00:00.001Z",
    level: "info",
    component: "runtime.http",
    message: "request completed",
    fields: { context: { tenant: "tenant-1" }, token: "top-secret-token", visible: "yes" },
    functionId: "orders.create",
    serviceId: "orders",
    traceId,
    requestId: "request-1",
  });
  await store.append({
    version: 2,
    signal: "trace",
    traceId,
    startedAt: "2026-08-16T00:00:00.000Z",
    spanCount: 1,
    outcome: "success",
  });
  await store.append({
    version: 2,
    signal: "span",
    spanId: "1000000000000001",
    invocationId: "invocation-1",
    traceId,
    name: "orders.create",
    functionId: "orders.create",
    serviceId: "orders",
    status: "completed",
    kind: "internal",
    revision: 1,
    startedAt: "2026-08-16T00:00:00.000Z",
    completedAt: "2026-08-16T00:00:00.001Z",
    outcome: "success",
  });
  const query = createObservabilityQuery(index, { maxDetailRecords: 10 });

  const requests = await query.requests({ routeId: "orders.create", outcome: "success" });
  const byFunction = await query.requests({ functionId: "orders.create" });
  const byRequest = await query.logs({ requestId: "request-1" });
  const byService = await query.logs({ serviceId: "orders" });
  const requestDetails = await query.request("request-1");
  const traceItems = await query.traces({ traceId });
  const traceDetails = await query.trace(traceId);

  expect(requests.items.filter((item) => item.phase === "completed")).toHaveLength(1);
  expect(byFunction.items.filter((item) => item.phase === "completed")).toHaveLength(1);
  expect(byRequest.items).toHaveLength(1);
  expect(byService.items).toHaveLength(1);
  expect(requestDetails?.request.requestId).toBe("request-1");
  expect(requestDetails?.records.some((record) => record.signal === "log")).toBe(true);
  expect(traceItems.items).toHaveLength(2);
  expect(traceDetails?.trace?.traceId).toBe(traceId);
  expect(traceDetails?.spans).toHaveLength(1);
  expect(JSON.stringify({ requestDetails, traceDetails })).not.toContain("top-secret-token");
  expect(JSON.stringify({ requestDetails, traceDetails })).not.toContain("tenant-1");
  await store.shutdown();
  await index.close();
});

test("pages distinct traces instead of span revisions", async () => {
  const root = await makeRoot();
  const index = await createObservabilityIndex({ root, maxPageSize: 2, maxEntries: 20 });
  const store = await createObservabilitySegmentStore({ root, index });
  for (let trace = 1; trace <= 3; trace++) {
    const traceId = trace.toString(16).padStart(32, "0");
    for (let revision = 0; revision < 2; revision++) {
      await store.append({
        version: 2,
        signal: "span",
        traceId,
        spanId: trace.toString(16).padStart(16, "0"),
        name: `trace-${trace}`,
        kind: "server",
        status: revision === 0 ? "started" : "completed",
        revision,
        startedAt: `2026-08-16T00:00:00.00${trace}Z`,
      });
    }
  }
  const query = createObservabilityQuery(index, { maxPageSize: 2 });

  const first = await query.traces({ limit: 2, order: "desc" });
  const second = await query.traces({ limit: 2, order: "desc", cursor: first.nextCursor });

  expect(new Set(first.items.map((item) => item.traceId)).size).toBe(2);
  expect(new Set(second.items.map((item) => item.traceId)).size).toBe(1);
  await store.shutdown();
  await index.close();
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function log(message: string, timestamp: string, level: "info" | "error") {
  return {
    version: 2 as const,
    signal: "log" as const,
    timestamp,
    level,
    component: "test",
    message,
    fields: { token: "top-secret-token" },
  };
}

function request(requestId: string, traceId: string, routeId: string, outcome: "success") {
  return {
    version: 2 as const,
    signal: "request" as const,
    phase: "completed" as const,
    requestId,
    originRequestId: requestId,
    traceId,
    generationId: "generation-1",
    graphHash: "sha256:test",
    invocationId: "invocation-1",
    startedAt: "2026-08-16T00:00:00.000Z",
    completedAt: "2026-08-16T00:00:00.001Z",
    durationMs: 1,
    method: "POST",
    rawPath: "/orders",
    normalizedRoute: routeId,
    routeId,
    functionId: "orders.create",
    serviceId: "orders",
    status: 201,
    outcome,
  };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join("/tmp", "relkit-observability-query-"));
  roots.push(root);
  return root;
}

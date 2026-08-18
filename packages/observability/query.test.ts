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
  expect(first.protocol).toBe("zsys.observability.query");
  await store.shutdown();
  await index.close();
});

test("filters correlated requests and returns redacted request/trace details", async () => {
  const root = await makeRoot();
  const index = await createObservabilityIndex({ root, maxEntries: 20 });
  const store = await createObservabilitySegmentStore({ root, index });
  await store.append(request("request-1", "trace-1", "orders.create", "success"));
  await store.append({
    version: 1,
    signal: "log",
    timestamp: "2026-08-16T00:00:00.001Z",
    level: "info",
    component: "runtime.http",
    message: "request completed",
    fields: { token: "top-secret-token", visible: "yes" },
    traceId: "trace-1",
    correlationId: "request-1",
  });
  await store.append({
    version: 1,
    signal: "trace",
    traceId: "trace-1",
    startedAt: "2026-08-16T00:00:00.000Z",
    spanCount: 1,
    outcome: "success",
  });
  await store.append({
    version: 1,
    signal: "span",
    spanId: "span-1",
    invocationId: "invocation-1",
    traceId: "trace-1",
    name: "orders.create",
    status: "completed",
    startedAt: "2026-08-16T00:00:00.000Z",
    completedAt: "2026-08-16T00:00:00.001Z",
    outcome: "success",
  });
  const query = createObservabilityQuery(index, { maxDetailRecords: 10 });

  const requests = await query.requests({ routeId: "orders.create", outcome: "success" });
  const byFunction = await query.requests({ functionId: "orders.create" });
  const byRequest = await query.logs({ requestId: "request-1" });
  const requestDetails = await query.request("request-1");
  const traceItems = await query.traces({ traceId: "trace-1" });
  const traceDetails = await query.trace("trace-1");

  expect(requests.items).toHaveLength(1);
  expect(byFunction.items).toHaveLength(1);
  expect(byRequest.items).toHaveLength(1);
  expect(requestDetails?.request.requestId).toBe("request-1");
  expect(requestDetails?.records.some((record) => record.signal === "log")).toBe(true);
  expect(traceItems.items).toHaveLength(2);
  expect(traceDetails?.trace?.traceId).toBe("trace-1");
  expect(traceDetails?.spans).toHaveLength(1);
  expect(JSON.stringify({ requestDetails, traceDetails })).not.toContain("top-secret-token");
  await store.shutdown();
  await index.close();
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function log(message: string, timestamp: string, level: "info" | "error") {
  return {
    version: 1 as const,
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
    version: 1 as const,
    signal: "request" as const,
    requestId,
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
    status: 201,
    outcome,
    timeline: [],
  };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join("/tmp", "zsys-observability-query-"));
  roots.push(root);
  return root;
}

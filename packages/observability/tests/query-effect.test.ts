import { expect, test } from "vitest";
import { Effect, Metric } from "effect";
import { makeObservabilityQueryEffect } from "../src/query-effect.js";
import { createObservabilityQuery } from "../src/query.js";
import { queryIndexLayer } from "../src/query-read-effect.js";
import { admitObservabilityRecord } from "../src/record-admission.js";
import type { QueryIndex } from "../src/query-utils.types.js";
const timestamp = "2026-09-25T00:00:00.000Z";
const traceId = "10000000000000000000000000000001";
const log = admitObservabilityRecord({
  version: 2,
  signal: "log",
  timestamp,
  level: "info",
  component: "test",
  message: "ready",
  fields: {},
  requestId: "request-1",
  traceId,
});
const request = admitObservabilityRecord({
  version: 2,
  signal: "request",
  phase: "completed",
  requestId: "request-1",
  originRequestId: "request-1",
  traceId,
  generationId: "generation-1",
  graphHash: "sha256:test",
  startedAt: timestamp,
  completedAt: timestamp,
  durationMs: 0,
  method: "GET",
  rawPath: "/orders",
  normalizedRoute: "orders.list",
  routeId: "orders.list",
  functionId: "list",
  status: 200,
  outcome: "success",
});
if (!log || !request) throw new Error("query test records were not admitted");
const entries = [
  { cursor: "1", signal: "log" as const, segment: "logs/one", offset: 0, bytes: 10, timestamp },
  {
    cursor: "2",
    signal: "request" as const,
    segment: "requests/one",
    offset: 0,
    bytes: 10,
    timestamp,
  },
];
const index: QueryIndex = {
  page: (options) => ({
    entries: entries.filter(
      (entry) => options?.signal === undefined || entry.signal === options.signal,
    ),
  }),
  tracePage: () => ({ entries: [] }),
  read: async (entry) => (entry.cursor === "1" ? log : request),
};
test("Effect query factory uses the supplied index and observes every operation", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const query = yield* makeObservabilityQueryEffect({ maxPageSize: 10 });
      const logs = yield* query.logs({ limit: 10 });
      const requests = yield* query.requests({ limit: 10 });
      const logDetail = yield* query.log("1");
      const requestDetail = yield* query.request("request-1");
      const traces = yield* query.traces({ limit: 10 });
      const trace = yield* query.trace(traceId);
      const metric = yield* Metric.value(
        Metric.counter("relkit_observability_query_operations_total", {
          attributes: { operation: "logs", outcome: "success" },
        }),
      );
      return { logs, requests, logDetail, requestDetail, traces, trace, metric };
    }).pipe(
      Effect.provide(queryIndexLayer(index)),
      Effect.provideService(Metric.MetricRegistry, registry),
    ),
  );
  expect(result.logs.items).toHaveLength(1);
  expect(result.requests.items).toHaveLength(1);
  expect(result.logDetail?.log.message).toBe("ready");
  expect(result.requestDetail?.request.requestId).toBe("request-1");
  expect(result.traces.items).toHaveLength(0);
  expect(result.trace).toBeUndefined();
  expect(result.metric.count).toBe(1);
});
test("Effect query construction tags bad detail bounds and adapter retains TypeError", async () => {
  const error = await Effect.runPromise(
    makeObservabilityQueryEffect({ maxDetailRecords: 0 }).pipe(
      Effect.flip,
      Effect.provide(queryIndexLayer(index)),
    ),
  );
  expect(error).toMatchObject({
    _tag: "QueryDetailError",
    message: "Detail bound must be positive",
  });
  expect(() => createObservabilityQuery(index, { maxDetailRecords: 0 })).toThrow(TypeError);
});

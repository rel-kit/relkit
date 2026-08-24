import { Effect } from "../../../packages/runtime-effect/node_modules/effect/dist/index.js";
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { Hono } from "../../../packages/inspector-api/node_modules/hono/dist/index.js";
import {
  createObservabilityCollector,
  createObservabilityIndex,
  createObservabilityQuery,
  createObservabilitySegmentStore,
  createObservabilityStream,
  isRedactedObservabilityRecord,
  type ObservabilityRecord,
  type RedactedObservabilityRecord,
} from "../../../packages/observability/src/index.ts";
import {
  OBSERVABILITY_RECORD_ADAPTERS,
  scanObservabilitySinks,
} from "../../../scripts/check-observability-sinks.ts";
import {
  createLoggerLayer,
  type HumanLogSink,
  type JsonLogSink,
  type RedactedLogRecord,
} from "../../../packages/runtime-effect/src/logger.ts";
import { API_BASE_PATH } from "../../../packages/contracts/src/index.ts";
import { installObservabilityEndpoints } from "../../../packages/inspector-api/src/index.ts";

const secret = "super-secret-password";
const root = resolve(import.meta.dir, "../../..");

test("every collector consumer and sink receives an admitted record", async () => {
  const collector = createObservabilityCollector();
  const admitted = collector.collect(unsafeLog());
  assertAdmitted("collector memory", admitted);
  assertAdmitted("collector read", collector.read()[0]);

  const loggerRecords: RedactedLogRecord[] = [];
  const human: HumanLogSink = { write: (_line, record) => loggerRecords.push(record) };
  const json: JsonLogSink = { write: (record) => loggerRecords.push(record) };
  await Effect.runPromise(
    Effect.logInfo(`password=${secret}`).pipe(
      Effect.annotateLogs({ password: secret }),
      Effect.provide(createLoggerLayer({ collector, human, json, minimumLevel: "trace" })),
    ),
  );
  for (const record of loggerRecords) assertAdmitted("logger sink", record);

  const stateRoot = await mkdtemp("/tmp/zsys-observability-consumers-");
  let index: Awaited<ReturnType<typeof createObservabilityIndex>> | undefined;
  try {
    index = await createObservabilityIndex({
      root: stateRoot,
      maxEntries: 100,
      now: () => Date.parse("2026-08-16T00:00:00.000Z"),
    });
    const store = await createObservabilitySegmentStore({ root: stateRoot, index });
    assertAdmitted("segment sink", await store.append(unsafeRequest()));
    assertAdmitted("segment sink", await store.append(unsafeTrace()));
    await store.shutdown();

    const entry = index.page({ signal: "request", limit: 1 }).entries[0];
    expect(entry).toBeDefined();
    assertAdmitted("index read", await index.read(entry!));

    const query = createObservabilityQuery(index);
    const requests = await query.requests();
    assertAdmitted("query response", requests.items[0]);
    const traces = await query.traces();
    assertAdmitted("trace query response", traces.items[0]);

    const stream = createObservabilityStream();
    const event = stream.publish({ type: "log.emitted", record: unsafeLog() });
    assertAdmitted("stream event", event?.data);

    const inspector = new Hono();
    installObservabilityEndpoints(inspector, {
      query,
      stream,
    });
    const response = await inspector.request(`${API_BASE_PATH}/requests`);
    expect(await response.text()).not.toContain(secret);
    const sse = await inspector.request(`${API_BASE_PATH}/stream`, {
      headers: { "last-event-id": "0" },
    });
    const reader = sse.body?.getReader();
    const frame = reader === undefined ? "" : new TextDecoder().decode((await reader.read()).value);
    await reader?.cancel();
    expect(frame).not.toContain(secret);
  } finally {
    await index?.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("source scan keeps record serialization and direct output inside adapters", () => {
  expect(OBSERVABILITY_RECORD_ADAPTERS.every((file) => existsSync(resolve(root, file)))).toBe(true);
  expect(scanObservabilitySinks(root)).toEqual([]);
});

function assertAdmitted(
  label: string,
  value: unknown,
): asserts value is RedactedObservabilityRecord {
  expect(value, label).toBeDefined();
  expect(isRedactedObservabilityRecord(value), label).toBe(true);
  expect(Object.isFrozen(value), label).toBe(true);
  expect(JSON.stringify(value), label).not.toContain(secret);
}

function unsafeLog(): ObservabilityRecord {
  return {
    version: 1,
    signal: "log",
    timestamp: "2026-08-16T00:00:00.000Z",
    level: "info",
    component: "consumer.test",
    message: `password=${secret}`,
    fields: { password: secret, authorization: `Bearer ${secret}` },
  } as unknown as ObservabilityRecord;
}

function unsafeRequest(): ObservabilityRecord {
  return {
    version: 1,
    signal: "request",
    requestId: "consumer.request",
    traceId: "consumer.trace",
    generationId: "consumer.generation",
    graphHash: "sha256:consumer",
    invocationId: "consumer.invocation",
    startedAt: "2026-08-16T00:00:00.000Z",
    completedAt: "2026-08-16T00:00:00.001Z",
    durationMs: 1,
    method: "POST",
    rawPath: "/consumer",
    normalizedRoute: "consumer.route",
    routeId: "consumer.route",
    functionId: "consumer.function",
    status: 200,
    outcome: "success",
    timeline: [],
    requestBody: { password: secret },
  } as unknown as ObservabilityRecord;
}

function unsafeTrace(): ObservabilityRecord {
  return {
    version: 1,
    signal: "trace",
    traceId: "consumer.trace",
    startedAt: "2026-08-16T00:00:00.000Z",
    spanCount: 1,
    outcome: "success",
    attributes: { password: secret },
  } as unknown as ObservabilityRecord;
}

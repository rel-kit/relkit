/** Checks persisted segments, indexed queries and every original inspector/runtime response before the owning test closes its index. */
import { expect } from "bun:test";
import { Hono } from "../../../packages/inspector-api/node_modules/hono/dist/index.js";
import { API_BASE_PATH } from "../../../packages/contracts/src/index.ts";
import {
  createObservabilityIndex,
  createObservabilityQuery,
  createObservabilitySegmentStore,
  createObservabilityStream,
  type LogRecord,
  type ObservabilityCollector,
} from "../../../packages/observability/src/index.ts";
import { installObservabilityEndpoints } from "../../../packages/inspector-api/src/index.ts";
import {
  securityTraceId,
  unsafeLog,
  unsafeRequest,
  unsafeTrace,
  unsafeSpan,
  unsafeJob,
  unsafeEvent,
} from "./redaction-records.fixture.js";
import { createHttpRuntime, readTree, assertNoSecrets } from "./redaction-runtime.fixture.js";
export async function persistAndQuery(
  root: string,
  index: Awaited<ReturnType<typeof createObservabilityIndex>>,
  capture: {
    readonly collector: ObservabilityCollector;
    readonly terminal: string[];
    readonly jsonLogs: LogRecord[];
  },
) {
  const { collector, terminal, jsonLogs } = capture;
  const store = await createObservabilitySegmentStore({ root, index });
  for (const record of [
    ...collector.read(),
    unsafeLog(),
    unsafeRequest(),
    unsafeTrace(),
    unsafeSpan(),
    unsafeJob(),
    unsafeEvent(),
  ])
    await store.append(record);
  await store.shutdown();
  const query = createObservabilityQuery(index, { maxDetailRecords: 100 });
  assertNoSecrets("in-memory collector", collector.read());
  const requestPage = await query.requests({ requestId: "security.request" });
  const logPage = await query.logs();
  const traceDetails = await query.trace(securityTraceId);
  expect(requestPage.items.length).toBeGreaterThan(0);
  expect(logPage.items.length).toBeGreaterThan(0);
  expect(traceDetails).toBeDefined();
  assertNoSecrets("request query", requestPage);
  assertNoSecrets("log query", logPage);
  assertNoSecrets("trace query", traceDetails);
  assertNoSecrets("terminal capture", terminal);
  assertNoSecrets("JSON log capture", jsonLogs);
  assertNoSecrets("NDJSON segments", await readTree(root));
  return { query, requestPage, logPage, traceDetails };
}
export async function assertEndpointRedaction(
  collector: ObservabilityCollector,
  evidence: Awaited<ReturnType<typeof persistAndQuery>>,
) {
  const { query, requestPage, logPage, traceDetails } = evidence;
  const inspector = new Hono();
  const stream = createObservabilityStream();
  stream.publish({ type: "log.emitted", data: unsafeLog() });
  installObservabilityEndpoints(inspector, { query, stream });
  const apiRuntime = createHttpRuntime(collector, {
    requests: requestPage,
    logs: logPage,
    traces: traceDetails?.records ?? [],
    stream: () => stream.replay().events,
  });
  for (const path of [
    `${API_BASE_PATH}/requests?requestId=security.request`,
    `${API_BASE_PATH}/requests/security.request`,
    `${API_BASE_PATH}/logs`,
    `${API_BASE_PATH}/traces/${securityTraceId}`,
  ])
    assertNoSecrets(`inspector API ${path}`, await (await inspector.request(path)).text());
  const sse = await inspector.request(`${API_BASE_PATH}/stream`, {
    headers: { "last-event-id": "0" },
  });
  const reader = sse.body!.getReader();
  const first = await reader.read();
  await reader.cancel();
  assertNoSecrets("SSE", new TextDecoder().decode(first.value));
  for (const path of [
    `${API_BASE_PATH}/requests`,
    `${API_BASE_PATH}/logs`,
    `${API_BASE_PATH}/traces`,
    `${API_BASE_PATH}/stream`,
  ]) {
    const response = await apiRuntime.request(`http://relkit.test${path}`);
    assertNoSecrets(`runtime API ${path}`, await response.text());
  }
}

/** Exercises all retained synthetic-secret redaction flows, persistence and public response sinks with joined fixture cleanup. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createObservabilityCollector,
  createObservabilityIndex,
  type LogRecord,
} from "../../../packages/observability/src/index.ts";
import { secrets, flowInput, source } from "./redaction-records.fixture.js";
import {
  emitLoggerRecord,
  flushTelemetry,
  runAgent,
  runJob,
  runEvent,
} from "./redaction-flows.fixture.js";
import { createHttpRuntime, assertNoSecrets } from "./redaction-runtime.fixture.js";
import { persistAndQuery, assertEndpointRedaction } from "./redaction-evidence.fixture.js";
test("recursively finds no synthetic secret in observable flows or sinks", async () => {
  const capture = await captureObservableFlows();
  const root = await mkdtemp(join("/tmp", "relkit-security-redaction-"));
  let index: Awaited<ReturnType<typeof createObservabilityIndex>> | undefined;
  try {
    index = await createObservabilityIndex({
      root,
      maxEntries: 200,
      now: () => Date.parse("2026-08-16T00:00:01.000Z"),
    });
    const evidence = await persistAndQuery(root, index, capture);
    await assertEndpointRedaction(capture.collector, evidence);
  } finally {
    await index?.close();
    await rm(root, { recursive: true, force: true });
  }
});
async function captureObservableFlows() {
  const collector = createObservabilityCollector();
  const terminal: string[] = [];
  const jsonLogs: LogRecord[] = [];
  await emitLoggerRecord(collector, terminal, jsonLogs);
  const agentTrace = await runAgent(collector);
  await runJob(collector);
  await runEvent(collector);
  await flushTelemetry();
  const runtime = createHttpRuntime(collector);
  const publicResponse = await runtime.request(
    "http://relkit.test/security?token=top-secret-token",
    {
      method: "POST",
      headers: {
        authorization: secrets.authorization,
        cookie: secrets.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify(flowInput),
    },
  );
  assertNoSecrets("public HTTP response", await publicResponse.text());
  const flowRecords = collector.read();
  expect(agentTrace.spans.some((span) => span.name.startsWith("relkit.agent.security.agent"))).toBe(
    true,
  );
  expect(
    flowRecords.some((record) => record.signal === "invocation" && record.source === "job"),
  ).toBe(true);
  expect(
    flowRecords.some(
      (record) => record.signal === "invocation" && record.source === "event-delivery",
    ),
  ).toBe(true);
  expect(flowRecords.some((record) => record.signal === "request")).toBe(true);
  return { collector, terminal, jsonLogs };
}

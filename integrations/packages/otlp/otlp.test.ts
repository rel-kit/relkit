import { expect, test } from "bun:test";
import { admitObservabilityRecord, type RedactedObservabilityRecord } from "@relkit/observability";
import { createBindingValueRef } from "@relkit/provider";
import { otlp } from "./src/index.ts";
import {
  createOtlpExporter,
  createOtlpTransport,
  type OtlpTransport,
} from "./src/runtime/index.ts";

test("declares a value-free OTLP exporter with named secret headers", () => {
  const descriptor = otlp({
    endpoint: "https://otel.example.test",
    headers: {
      authorization: createBindingValueRef("OTLP_AUTHORIZATION", "secret-string"),
    },
    serviceName: "orders",
  });

  expect(descriptor).toMatchObject({
    kind: "telemetry-exporter",
    protocolVersion: 1,
    integrationId: "otlp",
    adapterId: "otlp",
    configuration: {
      endpoint: "https://otel.example.test",
      headers: { authorization: { name: "OTLP_AUTHORIZATION", sensitive: true } },
      serviceName: "orders",
    },
  });
  expect(() => otlp({ endpoint: "file:///tmp/otlp" })).toThrow("http or https");
});

test("posts canonical payloads to selected OTLP/HTTP signal paths", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const transport = createOtlpTransport({
    endpoint: "https://otel.example.test/base",
    headers: { authorization: "Bearer token" },
    fetch: (async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(null, { status: 202 });
    }) as typeof fetch,
  });

  await transport.send("traces", { resourceSpans: [], z: 1, a: 2 });
  expect(requests[0]?.url).toBe("https://otel.example.test/base/v1/traces");
  expect(requests[0]?.init?.body).toBe('{"a":2,"resourceSpans":[],"z":1}');
  expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe("Bearer token");
  await transport.close();
  await expect(transport.send("logs", { resourceLogs: [] })).rejects.toThrow("closed");
});

test("bounds failure details and rejects non-HTTP endpoints", async () => {
  expect(() => createOtlpTransport({ endpoint: "file:///tmp/otlp" })).toThrow("http or https");
  let requestUrl = "";
  const transport = createOtlpTransport({
    endpoint: "https://otel.example.test/v1/logs",
    fetch: (async (input) => {
      requestUrl = String(input);
      return new Response("collector unavailable", { status: 503 });
    }) as typeof fetch,
  });
  await expect(transport.send("traces", {})).rejects.toThrow(
    "OTLP traces export failed with status 503: collector unavailable",
  );
  expect(requestUrl).toBe("https://otel.example.test/v1/traces");
});

test("uses one bounded batching queue with retries and complete-unit overflow", async () => {
  const sent: string[] = [];
  let traceAttempts = 0;
  const transport = fakeTransport(async (signal) => {
    sent.push(signal);
    if (signal === "traces" && traceAttempts++ < 2) throw new Error("temporary");
  });
  const exporter = createOtlpExporter({
    transport,
    maxRecords: 3,
    batchSize: 3,
    maxRetries: 2,
    retryDelayMs: 0,
    delay: async () => undefined,
  });
  exporter.exportRecord(span("trace-a", "root"));
  exporter.exportRecord(span("trace-a", "child"));
  exporter.exportRecord(log("one"));
  exporter.exportRecord(span("trace-b", "root"));
  await exporter.flush();

  expect(sent).toEqual(["logs", "traces", "traces", "traces"]);
  expect(exporter.stats()).toMatchObject({
    exportedRecords: 2,
    retries: 2,
    failures: 2,
    droppedRecords: 2,
    droppedUnits: 1,
    queuedRecords: 0,
  });
  await exporter.close();
});

test("bounds shutdown and aborts an active OTLP request", async () => {
  const transport = fakeTransport(
    (_signal, _payload, abort) =>
      new Promise<void>((_resolve, reject) => {
        abort?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
  );
  const exporter = createOtlpExporter({ transport, maxRetries: 0 });
  exporter.exportRecord(log("blocked"));
  const started = performance.now();
  await exporter.close(10);
  expect(performance.now() - started).toBeLessThan(250);
  await Promise.resolve();
  expect(exporter.stats()).toMatchObject({ failures: 1, droppedRecords: 1, droppedUnits: 1 });
});

function fakeTransport(send: OtlpTransport["send"]): OtlpTransport {
  return { send, flush: () => Promise.resolve(), close: () => Promise.resolve() };
}

function log(message: string): RedactedObservabilityRecord {
  return admitObservabilityRecord({
    version: 1,
    signal: "log",
    timestamp: "2026-09-02T00:00:00.000Z",
    level: "info",
    component: "test",
    message,
    fields: {},
  })!;
}

function span(traceId: string, spanId: string): RedactedObservabilityRecord {
  return admitObservabilityRecord({
    version: 1,
    signal: "span",
    spanId,
    invocationId: "invocation-1",
    traceId,
    name: spanId,
    status: "completed",
    startedAt: "2026-09-02T00:00:00.000Z",
    completedAt: "2026-09-02T00:00:00.001Z",
    durationMs: 1,
    outcome: "success",
  })!;
}

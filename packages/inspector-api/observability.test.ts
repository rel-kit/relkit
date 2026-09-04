import { describe, expect, test } from "bun:test";
import { API_BASE_PATH } from "@relkit/contracts";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createObservabilityRuntime,
  createObservabilityStream,
  createTelemetryExporterFanout,
  defineTelemetryExporter,
  type ObservabilityQuery,
  type ObservabilityQueryRequest,
} from "@relkit/observability";
import { Hono } from "hono";
import {
  installObservabilityEndpoints,
  installInspectorEndpoints,
  ObservabilityEndpointConfigurationError,
} from "./src/index.ts";

const queryProtocol = "relkit.observability.query" as const;
const query: ObservabilityQuery = {
  requests: async () => ({ protocol: queryProtocol, version: 1, items: [] }),
  logs: async () => ({ protocol: queryProtocol, version: 1, items: [] }),
  traces: async () => ({ protocol: queryProtocol, version: 1, items: [] }),
  request: async (requestId) =>
    requestId === "request-1"
      ? ({ protocol: queryProtocol, version: 1, request: { requestId }, records: [] } as never)
      : undefined,
  log: async () => undefined,
  trace: async (traceId) =>
    traceId === "trace-1"
      ? ({ protocol: queryProtocol, version: 1, spans: [], records: [] } as never)
      : undefined,
};

describe("inspector observability endpoints", () => {
  test("serves bounded query pages and details with safe validation errors", async () => {
    const seen: ObservabilityQueryRequest[] = [];
    const service = new Hono();
    installObservabilityEndpoints(service, {
      query: {
        ...query,
        requests: async (value = {}) => (seen.push(value), query.requests(value)),
      },
      stream: createObservabilityStream(),
    });

    const page = await service.request(
      `${API_BASE_PATH}/requests?limit=1000&cursor=1&severity=error&routeId=orders.create&serviceId=orders`,
    );
    expect(page.status).toBe(200);
    expect(await page.json()).toMatchObject({ protocol: queryProtocol, version: 1, items: [] });
    expect(seen[0]).toMatchObject({
      limit: 100,
      cursor: "1",
      severity: "error",
      serviceId: "orders",
    });

    const detail = await service.request(`${API_BASE_PATH}/requests/request-1`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ request: { requestId: "request-1" } });
    expect((await service.request(`${API_BASE_PATH}/traces/unknown`)).status).toBe(404);

    const invalid = await service.request(`${API_BASE_PATH}/logs?cursor=not-a-cursor`);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: "RELKIT_OBSERVABILITY_QUERY_INVALID",
    });
  });

  test("disables production by default and protects explicitly enabled endpoints", async () => {
    const disabled = new Hono();
    installObservabilityEndpoints(disabled, {
      query,
      stream: createObservabilityStream(),
      mode: "production",
    });
    expect((await disabled.request(`${API_BASE_PATH}/logs`)).status).toBe(404);

    expect(() =>
      installObservabilityEndpoints(new Hono(), {
        query,
        stream: createObservabilityStream(),
        mode: "production",
        enabled: true,
      }),
    ).toThrow(ObservabilityEndpointConfigurationError);

    const secured = new Hono();
    installObservabilityEndpoints(secured, {
      query,
      stream: createObservabilityStream(),
      mode: "production",
      enabled: true,
      bearerToken: "test-token",
    });
    const denied = await secured.request(`${API_BASE_PATH}/logs`);
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toBe("Bearer");
    expect(
      (
        await secured.request(`${API_BASE_PATH}/logs`, {
          headers: { authorization: "Bearer test-token" },
        })
      ).status,
    ).toBe(200);
  });

  test("streams versioned events and removes subscribers on disconnect", async () => {
    const stream = createObservabilityStream();
    stream.publish({ type: "log.emitted", data: { message: "first" } });
    const service = new Hono();
    installObservabilityEndpoints(service, { query, stream });

    const response = await service.request(`${API_BASE_PATH}/stream?type=log.emitted`, {
      headers: { "last-event-id": "0" },
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    const connected = await reader.read();
    expect(new TextDecoder().decode(connected.value)).toBe(": connected\n\n");
    const event = await reader.read();
    const text = new TextDecoder().decode(event.value);
    expect(text).toContain("id: 1");
    expect(text).toContain("event: log.emitted");
    expect(text).toContain('"protocol":"relkit.observability.stream"');
    await reader.cancel();
    expect(stream.stats().subscribers).toBe(0);
  });

  test("streams generation activation events with a resumable cursor", async () => {
    const stream = createObservabilityStream();
    stream.publish({
      type: "generation.changed",
      data: {
        generationId: "generation-2",
        graphHash: "sha256:two",
        event: "activated",
        sourceVersion: 2,
        password: "hidden",
      },
    });
    const service = new Hono();
    installObservabilityEndpoints(service, { query, stream });

    const response = await service.request(`${API_BASE_PATH}/stream?type=generation.changed`);
    const reader = response.body!.getReader();
    const connected = await reader.read();
    expect(new TextDecoder().decode(connected.value)).toBe(": connected\n\n");
    const event = await reader.read();
    const text = new TextDecoder().decode(event.value);
    expect(text).toContain("id: 1");
    expect(text).toContain("event: generation.changed");
    expect(text).toContain('"generationId":"generation-2"');
    expect(text).toContain('"graphHash":"sha256:two"');
    expect(text).not.toContain("hidden");
    await reader.cancel();
  });

  test("keeps sampled records redacted and live in Inspector without forced error exports", async () => {
    const root = await mkdtemp(join("/tmp", "relkit-inspector-telemetry-"));
    const secret = "must-not-cross-inspector";
    const fanout = await createTelemetryExporterFanout({
      exporters: { broken: defineTelemetryExporter("broken", "broken", {}) },
      modules: [
        {
          module: {
            runtimeIntegration: {
              kind: "runtime-integration",
              integrationId: "broken",
              registrations: [{ capability: "telemetry", adapterId: "broken", protocolVersion: 1 }],
            },
            createTelemetryExporter: async () => ({
              exportRecord: () => {
                throw new Error(secret);
              },
              flush: () => Promise.resolve(),
              close: () => Promise.resolve(),
            }),
          },
        },
      ],
    });
    const runtime = await createObservabilityRuntime({
      root,
      configuration: { exportSampling: { traceRate: 0 } },
      exporter: fanout,
    });
    try {
      const common = {
        version: 2 as const,
        traceId: "10000000000000000000000000000001",
        requestId: "request-complete",
      };
      expect(
        runtime.collect({
          ...common,
          signal: "request",
          phase: "completed",
          generationId: "generation-one",
          graphHash: "sha256:one",
          invocationId: "invocation-one",
          startedAt: "2026-09-02T00:00:00.000Z",
          completedAt: "2026-09-02T00:00:00.001Z",
          durationMs: 1,
          method: "GET",
          rawPath: "/orders",
          normalizedRoute: "/orders",
          routeId: "orders.list",
          functionId: "orders.list",
          status: 200,
          outcome: "success",
        }),
      ).toBeDefined();
      runtime.collect({
        ...common,
        signal: "span",
        spanId: "2000000000000001",
        invocationId: "invocation-one",
        name: "orders.list",
        kind: "internal",
        status: "completed",
        revision: 1,
        outcome: "success",
        startedAt: "2026-09-02T00:00:00.000Z",
        completedAt: "2026-09-02T00:00:00.001Z",
        durationMs: 1,
        attributes: { token: secret },
      });
      runtime.collect({
        ...common,
        signal: "log",
        timestamp: "2026-09-02T00:00:00.000Z",
        level: "info",
        component: "orders.list",
        message: "local evidence",
        fields: { token: secret },
      });
      await runtime.flush();

      const app = new Hono();
      installInspectorEndpoints(app, {
        activeGeneration: {
          generationId: "generation-one",
          graphHash: "sha256:one",
          telemetry: () => ({
            sampling: { traceRate: 0 },
            counters: runtime.exportCounters(),
            exporters: runtime.exporterStats(),
          }),
        },
        query: runtime.query,
        stream: runtime.stream,
      });
      const [requests, traces, logs, metadata] = await Promise.all(
        ["requests", "traces", "logs", "runtime"].map(async (path) =>
          (await app.request(`${API_BASE_PATH}/${path}`)).json(),
        ),
      );
      expect(requests.items).toHaveLength(1);
      expect(traces.items).toHaveLength(1);
      expect(logs.items).toHaveLength(1);
      expect(metadata.telemetry).toMatchObject({
        counters: { persisted: 3, sampledOut: 3, exportSelected: 0 },
        exporters: [{ name: "broken", healthy: true, received: 3, failures: 0 }],
      });
      expect(runtime.readRecords().map((record) => record.signal)).toEqual([
        "request",
        "span",
        "log",
      ]);
      expect(runtime.exporterStats()[0]).toMatchObject({ received: 3, failures: 0 });
      expect(
        JSON.stringify({ requests, traces, logs, metadata, records: runtime.readRecords() }),
      ).not.toContain(secret);

      const response = await app.request(`${API_BASE_PATH}/stream?type=log.emitted`);
      const reader = response.body!.getReader();
      await reader.read();
      const event = new TextDecoder().decode((await reader.read()).value);
      expect(event).toContain("local evidence");
      expect(event).toContain('"fields":{}');
      expect(event).not.toContain(secret);
      await reader.cancel();
    } finally {
      await runtime.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

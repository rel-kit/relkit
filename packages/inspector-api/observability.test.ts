import { describe, expect, test } from "bun:test";
import { API_BASE_PATH } from "@zsys/contracts";
import {
  createObservabilityStream,
  type ObservabilityQuery,
  type ObservabilityQueryRequest,
} from "@zsys/observability";
import { Hono } from "hono";
import {
  installObservabilityEndpoints,
  ObservabilityEndpointConfigurationError,
} from "./src/index.ts";

const queryProtocol = "zsys.observability.query" as const;
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
      `${API_BASE_PATH}/requests?limit=1000&cursor=1&severity=error&routeId=orders.create`,
    );
    expect(page.status).toBe(200);
    expect(await page.json()).toMatchObject({ protocol: queryProtocol, version: 1, items: [] });
    expect(seen[0]).toMatchObject({ limit: 100, cursor: "1", severity: "error" });

    const detail = await service.request(`${API_BASE_PATH}/requests/request-1`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ request: { requestId: "request-1" } });
    expect((await service.request(`${API_BASE_PATH}/traces/unknown`)).status).toBe(404);

    const invalid = await service.request(`${API_BASE_PATH}/logs?cursor=not-a-cursor`);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: "ZSYS_OBSERVABILITY_QUERY_INVALID",
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
    expect(text).toContain('"protocol":"zsys.observability.stream"');
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
});

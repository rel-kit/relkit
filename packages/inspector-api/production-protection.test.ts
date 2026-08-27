import { describe, expect, test } from "bun:test";
import { API_BASE_PATH } from "@relkit/contracts";
import { createObservabilityStream, type ObservabilityQuery } from "@relkit/observability";
import { Hono } from "hono";
import {
  installInspectorEndpoints,
  installObservabilityEndpoints,
  type InspectorActionServices,
} from "./src/index.ts";

const identity = { generationId: "generation-one", graphHash: "sha256:one" };
const generation = {
  ...identity,
  graph: { contractVersion: 3, nodes: [], edges: [] },
};
const query: ObservabilityQuery = {
  requests: async () => ({ protocol: "relkit.observability.query", version: 1, items: [] }),
  logs: async () => ({ protocol: "relkit.observability.query", version: 1, items: [] }),
  traces: async () => ({ protocol: "relkit.observability.query", version: 1, items: [] }),
  request: async () => undefined,
  log: async () => undefined,
  trace: async () => undefined,
};

describe("production protection configuration", () => {
  test("disables graph and observability routes by default", async () => {
    const inspector = new Hono();
    installInspectorEndpoints(inspector, {
      mode: "production",
      activeGeneration: generation,
      query,
      stream: createObservabilityStream(),
    });
    expect((await inspector.request(`${API_BASE_PATH}/graph`)).status).toBe(404);
    expect((await inspector.request(`${API_BASE_PATH}/logs`)).status).toBe(404);

    const observability = new Hono();
    installObservabilityEndpoints(observability, {
      mode: "production",
      query,
      stream: createObservabilityStream(),
    });
    expect((await observability.request(`${API_BASE_PATH}/logs`)).status).toBe(404);
  });

  test("rejects explicitly enabled production routes without protection", () => {
    expect(() =>
      installInspectorEndpoints(new Hono(), {
        mode: "production",
        enabled: true,
        activeGeneration: generation,
      }),
    ).toThrow(/require bearerToken or authorize/);
    expect(() =>
      installObservabilityEndpoints(new Hono(), {
        mode: "production",
        enabled: true,
        query,
        stream: createObservabilityStream(),
      }),
    ).toThrow(/require bearerToken or authorize/);
    expect(() =>
      installInspectorEndpoints(new Hono(), {
        mode: "production",
        enabled: true,
        bearerToken: "   ",
        activeGeneration: generation,
      }),
    ).toThrow(/bearerToken must not be empty/);
  });
});

describe("production protection runtime enforcement", () => {
  test("protects graph and observability independently with a bearer token", async () => {
    const app = new Hono();
    installInspectorEndpoints(app, {
      mode: "production",
      enabled: true,
      bearerToken: "test-token",
      activeGeneration: generation,
      query,
      stream: createObservabilityStream(),
    });

    expect((await app.request(`${API_BASE_PATH}/graph`)).status).toBe(401);
    expect((await app.request(`${API_BASE_PATH}/logs`)).status).toBe(401);
    const headers = { authorization: "Bearer test-token" };
    expect((await app.request(`${API_BASE_PATH}/graph`, { headers })).status).toBe(200);
    expect((await app.request(`${API_BASE_PATH}/logs`, { headers })).status).toBe(200);
  });

  test("does not bypass a configured authorizer that denies a request", async () => {
    let allowed = false;
    const app = new Hono();
    installInspectorEndpoints(app, {
      mode: "production",
      enabled: true,
      authorize: () => allowed,
      activeGeneration: generation,
      query,
      stream: createObservabilityStream(),
    });

    expect((await app.request(`${API_BASE_PATH}/graph`)).status).toBe(401);
    expect((await app.request(`${API_BASE_PATH}/logs`)).status).toBe(401);
    allowed = true;
    expect((await app.request(`${API_BASE_PATH}/graph`)).status).toBe(200);
    expect((await app.request(`${API_BASE_PATH}/logs`)).status).toBe(200);
  });

  test("rejects authenticated production control actions before dispatch", async () => {
    let invoked = false;
    const actions: InspectorActionServices = {
      functions: {
        invoke: async () => {
          invoked = true;
          return { ok: true };
        },
      },
    };
    const app = new Hono();
    installInspectorEndpoints(app, {
      mode: "production",
      enabled: true,
      bearerToken: "test-token",
      activeGeneration: { ...generation, actions },
    });

    const response = await app.request(`${API_BASE_PATH}/actions/functions/orders.create/invoke`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...identity,
        idempotencyKey: "production-action",
        input: null,
      }),
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("RELKIT_INSPECTOR_ACTIONS_DISABLED");
    expect(invoked).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import {
  API_BASE_PATH,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
} from "@relkit/contracts";
import type { RegistrationPlan } from "@relkit/graph";
import {
  createApp,
  InternalEndpointConfigurationError,
  type InternalQuery,
  type RuntimeManifest,
} from "./src/index.js";
import { runtimeCohort } from "./test-cohort.ts";

const plan: RegistrationPlan = {
  graphHash: "sha256:internal",
  functions: [],
  httpTriggers: [],
  queues: [],
  schedules: [],
  eventTriggers: [],
  buckets: [],
  caches: [],
  tools: [],
  agents: [],
  middlewares: [],
};
const manifest: RuntimeManifest = {
  ...runtimeCohort(plan.graphHash),
  functions: {},
  middleware: {},
  requestTransforms: {},
};

function app(internalEndpoints = {}) {
  return createApp({
    plan,
    manifest,
    engine: { invoke: async () => undefined },
    internalEndpoints,
  });
}

describe("versioned internal endpoints", () => {
  test("serves health, graph, bounded query pages, stream, and diagnostics stubs", async () => {
    let query: InternalQuery | undefined;
    const service = app({
      readiness: { ready: false, reason: "provider-starting" },
      requests: (value) => {
        query = value;
        return { items: [{ id: "request-1" }], nextCursor: "cursor-2" };
      },
      stream: () => [{ cursor: "cursor-1", type: "diagnostic.changed", data: { count: 1 } }],
    });

    const live = await service.request(`${API_BASE_PATH}/health/live`);
    expect(live.status).toBe(200);
    expect(await live.json()).toMatchObject({
      protocol: "relkit.inspector",
      version: 1,
      status: "ok",
    });

    const ready = await service.request(`${API_BASE_PATH}/health/ready`);
    expect(ready.status).toBe(503);
    expect(await ready.json()).toMatchObject({ status: "not-ready", reason: "provider-starting" });

    const graph = await service.request(`${API_BASE_PATH}/graph`);
    expect(await graph.json()).toMatchObject({
      protocol: "relkit.inspector",
      version: 1,
      graphHash: "sha256:internal",
      manifestGraphHash: "sha256:internal",
      graphContractVersion: GRAPH_VERSION,
      manifestContractVersion: MANIFEST_VERSION,
      manifestGeneratorVersion: GENERATOR_VERSION,
    });

    const requests = await service.request(`${API_BASE_PATH}/requests?limit=1000&cursor=cursor-1`);
    expect(requests.status).toBe(200);
    expect(await requests.json()).toMatchObject({
      items: [{ id: "request-1" }],
      nextCursor: "cursor-2",
    });
    expect(query).toMatchObject({ limit: 100, cursor: "cursor-1" });

    const stream = await service.request(`${API_BASE_PATH}/stream`);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    expect(await stream.text()).toContain("event: diagnostic.changed");
    expect(await (await service.request(`${API_BASE_PATH}/diagnostics`)).json()).toMatchObject({
      items: [],
    });
    const invalid = await service.request(`${API_BASE_PATH}/requests?limit=bad`);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "invalid-query" });
  });

  test("disables production endpoints by default and rejects unprotected enablement", async () => {
    const disabled = app({ mode: "production" });
    expect((await disabled.request(`${API_BASE_PATH}/health/live`)).status).toBe(404);
    expect(() => app({ mode: "production", enabled: true })).toThrow(
      InternalEndpointConfigurationError,
    );
  });

  test("protects explicitly enabled production endpoints with a bearer token", async () => {
    const service = app({ mode: "production", enabled: true, bearerToken: "test-token" });
    expect((await service.request(`${API_BASE_PATH}/health/live`)).status).toBe(401);
    expect(
      (
        await service.request(`${API_BASE_PATH}/health/live`, {
          headers: { authorization: "Bearer test-token" },
        })
      ).status,
    ).toBe(200);

    const denied = app({ mode: "production", enabled: true, authorize: () => false });
    expect((await denied.request(`${API_BASE_PATH}/health/live`)).status).toBe(401);
  });
});

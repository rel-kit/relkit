/** Verifies independent core probes and protected legacy inspection through actual Hono requests. */
import { expect, test } from "vitest";
import { Hono } from "hono";
import {
  API_BASE_PATH,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
} from "../../src/contracts/index.js";
import type { RegistrationPlan } from "../../src/graph/index.js";
import {
  createApp,
  InternalEndpointConfigurationError,
  installInternalEndpoints,
  type InternalQuery,
  type RuntimeManifest,
} from "../../src/runtime-hono/index.js";
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
  channels: [],
  middlewares: [],
};
const manifest: RuntimeManifest = {
  ...runtimeCohort(plan.graphHash),
  functions: {},
  middleware: {},
  requestTransforms: {},
};

/** Builds one checked cohort using the supplied probe/inspection policy.
 * @param internalEndpoints - Existing native endpoint policy overrides.
 * @returns Constructed application with core probes independent of rich exposure.
 */
function app(internalEndpoints = {}) {
  return createApp({
    plan,
    manifest,
    engine: { invoke: async () => undefined },
    internalEndpoints,
  });
}

test("serves health, graph, bounded query pages, stream, and diagnostics stubs", async () => {
  let query: InternalQuery | undefined;
  const service = app({
    readiness: { ready: false, reason: "provider-starting" },
    requests: (value: InternalQuery) => {
      query = value;
      return { items: [{ id: "request-1" }], nextCursor: "cursor-2" };
    },
    stream: () => [{ cursor: "cursor-1", type: "diagnostic.changed", data: { count: 1 } }],
  });

  await assertCoreProbes(service);

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
  // Diagnostics are inspection data: without a configured source the application port has none.
  expect((await service.request(`${API_BASE_PATH}/diagnostics`)).status).toBe(404);
  const invalid = await service.request(`${API_BASE_PATH}/requests?limit=bad`);
  expectProblem(invalid, 400);
  expect(await invalid.json()).toMatchObject({
    type: "/errors/invalid-query",
    status: 400,
    code: "invalid-query",
  });
});

/** Checks that an internal endpoint error is Problem Details carrying a request ID.
 * @param response - Endpoint answer. @param status - Expected status.
 */
function expectProblem(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toBe("application/problem+json");
  expect(response.headers.get("x-request-id")).toMatch(/\S/);
}

test("internal endpoint errors are Problem Details with a request ID", async () => {
  const failing = app({
    mode: "production",
    enabled: true,
    bearerToken: "test-token",
    requests: () => {
      throw new Error("private failure detail");
    },
  });
  for (const path of ["health/live", "health/ready", "graph"]) {
    const denied = await failing.request(`${API_BASE_PATH}/${path}`);
    expectProblem(denied, 401);
    expect(denied.headers.get("www-authenticate")).toBe("Bearer");
    expect(await denied.json()).toMatchObject({ status: 401, code: "internal-endpoint-protected" });
  }
  const standalone = new Hono();
  installInternalEndpoints(standalone, {
    requests: () => {
      throw new Error("private failure detail");
    },
  });
  const failed = await standalone.request(`${API_BASE_PATH}/requests`);
  expectProblem(failed, 500);
  const text = await failed.text();
  expect(JSON.parse(text)).toMatchObject({ status: 500, code: "internal-error" });
  expect(text).not.toContain("private failure detail");
});

/** Checks the unchanged health/readiness/cohort witnesses on the actual core endpoints. */
async function assertCoreProbes(service: ReturnType<typeof app>) {
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
}

test("the unauthenticated graph probe carries identity only", async () => {
  const node = {
    id: "orders.create",
    source: { file: "src/services/orders/private-source.ts" },
    permissions: ["orders:approve-secret"],
    env: ["PRIVATE_ENV_NAME"],
  };
  const leaky = { ...plan, functions: [node] } as unknown as RegistrationPlan;
  const witness = {
    generationId: "generation.runtime",
    graphHash: plan.graphHash,
    activationFingerprint: { graphHash: plan.graphHash },
    manifestGraphHash: plan.graphHash,
    graphContractVersion: GRAPH_VERSION,
    manifestContractVersion: MANIFEST_VERSION,
    manifestGeneratorVersion: GENERATOR_VERSION,
    graph: { nodes: [node] },
    functions: [node],
  };
  const engine = { invoke: async () => undefined };
  const applications = [
    createApp({ plan: leaky, manifest, engine }),
    createApp({ plan: leaky, manifest, engine, internalEndpoints: { graph: witness } }),
  ];
  const standalone = new Hono();
  installInternalEndpoints(standalone, { graph: witness });
  for (const service of [...applications, standalone]) {
    const response = await service.request(`${API_BASE_PATH}/graph`);
    expect(response.status).toBe(200);
    const text = await response.text();
    for (const secret of ["private-source.ts", "orders:approve-secret", "PRIVATE_ENV_NAME"])
      expect(text).not.toContain(secret);
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body).not.toHaveProperty("graph");
    expect(body).not.toHaveProperty("functions");
    expect(body).toMatchObject({
      protocol: "relkit.inspector",
      graphHash: plan.graphHash,
      graphContractVersion: GRAPH_VERSION,
    });
  }
  const identified = await applications[1]!.request(`${API_BASE_PATH}/graph`);
  expect(await identified.json()).toMatchObject({
    generationId: "generation.runtime",
    activationFingerprint: { graphHash: plan.graphHash },
  });
});

test("keeps production health independent and rejects direct unprotected rich enablement", async () => {
  const disabled = app({ mode: "production" });
  expect((await disabled.request(`${API_BASE_PATH}/health/live`)).status).toBe(200);
  expect((await disabled.request(`${API_BASE_PATH}/graph`)).status).toBe(404);
  expect((await disabled.request(`${API_BASE_PATH}/diagnostics`)).status).toBe(404);
  const override = app({ mode: "production", enabled: true });
  expect((await override.request(`${API_BASE_PATH}/diagnostics`)).status).toBe(404);
  expect(() => installInternalEndpoints(new Hono(), { mode: "production", enabled: true })).toThrow(
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

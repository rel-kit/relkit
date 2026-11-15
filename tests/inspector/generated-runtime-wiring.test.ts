import { expect, test } from "bun:test";
import { Hono } from "../../packages/relkit/node_modules/hono";
import * as inspectorApi from "../../packages/relkit/src/inspector-api/index.ts";
import { inspectorEndpointsSource } from "../../packages/cli/src/commands/build-server-http-inspector.ts";
import { SERVER_RUNTIME_SUPPORT_SOURCE } from "../../packages/cli/src/commands/build-server-runtime-support.ts";
import { SERVER_INVOCATION_SOURCE } from "../../packages/cli/src/commands/build-server-invocation.ts";
import { invokeEventFunction } from "../../packages/relkit/src/engine/event-invocation.ts";

function application() {
  const app = new Hono();
  const plan = {
    jobs: [],
    events: [{ id: "demo.event", profile: "local" }],
    buckets: [{ id: "demo.bucket", profile: "local" }],
    caches: [],
  };
  const eventProvider = {
    query: () => ({
      events: [],
      triggers: [],
      capabilities: [],
      publications: [{ eventId: "demo.event", instanceId: "publication" }],
      deliveries: [{ eventId: "demo.event", deliveryId: "delivery", state: "completed" }],
    }),
  };
  const registry = {
    resolve: (capability: string) => ({
      value: capability === "event" ? eventProvider : {},
      binding: { adapter: { features: ["signedReadUrl", "signedWriteUrl"] } },
    }),
  };
  const source = inspectorEndpointsSource({ maxPreviewBytes: 1024 } as never);
  new Function(
    "app",
    "installInspectorEndpoints",
    "providerStartup",
    "plan",
    "InspectorQueryError",
    "process",
    "module",
    `
    const runtimeManifest = { functions: {}, targets: {}, services: {} };
    const runtimeState = () => ({ ready: { provider: true }, stopping: false });
    const generationId = "test", graphHash = "sha256:test", activationFingerprint = undefined;
    const graph = { nodes: [], edges: [] }, environment = "test", internalEndpointsEnabled = true;
    const runtimeIntegrationsPlan = {}, localServicesInspector = {};
    const telemetryConfiguration = {}, telemetry = { exportCounters: () => ({}), exporterStats: () => [] };
    ${SERVER_RUNTIME_SUPPORT_SOURCE}
    ${source}
  `,
  )(
    app,
    inspectorApi.installInspectorEndpoints,
    Promise.resolve(registry),
    plan,
    inspectorApi.InspectorQueryError,
    { env: { RELKIT_INSPECTOR_SESSION_TOKEN: "fixture-private-token" } },
    inspectorApi,
  );
  return app;
}

test("generated host connects event runtime inspection", async () => {
  const response = await application().request("/_relkit/v1/runtime/events?eventId=demo.event", {
    headers: { "x-relkit-inspector-session-token": "fixture-private-token" },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    publications: [{ instanceId: "publication" }],
    deliveries: [{ state: "completed" }],
  });
});

test("generated host projects bucket binding features", async () => {
  const response = await application().request("/_relkit/v1/runtime/buckets/demo.bucket", {
    headers: { "x-relkit-inspector-session-token": "fixture-private-token" },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    state: {
      id: "demo.bucket",
      capabilities: { signedReadUrl: true, signedWriteUrl: true },
    },
  });
});

test("generated rich APIs reject direct callers without the private bridge credential", async () => {
  expect((await application().request("/_relkit/v1/runtime/events")).status).toBe(401);
});

test("the generated inspector puts agent inspection behind the inspection session (RK-03)", () => {
  const authorize = (application() as unknown as Record<symbol, (request: Request) => boolean>)[
    Symbol.for("relkit.inspection.authorize")
  ]!;
  const path = "http://localhost/_relkit/v1/runtime/agents/review/executions";
  const request = (token?: string) =>
    new Request(
      path,
      token === undefined ? {} : { headers: { "x-relkit-inspector-session-token": token } },
    );
  expect(authorize(request())).toBe(false);
  expect(authorize(request("wrong"))).toBe(false);
  expect(authorize(request("fixture-private-token"))).toBe(true);
});

/**
 * Evaluates the generated `invokeHttp` with a recording engine `invoke`.
 * @returns The generated function and the engine options it passed.
 */
function generatedInvoke() {
  const seen: Record<string, unknown>[] = [];
  const invokeHttp = new Function(
    "invoke",
    `
    const providerStartup = Promise.resolve({});
    const plan = { jobs: [] }, nativeJobsRuntimes = new Map(), registry = {}, values = {};
    const graph = { nodes: [] }, telemetry = {}, authRuntime = undefined;
    const shutdownController = new AbortController();
    const authRequestStorage = { getStore: () => undefined, run: (_auth, run) => run() };
    const runtimeOwner = { track: (task) => task };
    const targetFor = () => undefined, createDependencySources = () => ({});
    const recordObservedEdge = () => undefined;
    ${SERVER_INVOCATION_SOURCE}
    return invokeHttp;
  `,
  )(async (options: Record<string, unknown>) => {
    seen.push(options);
    return undefined;
  }) as (request: Record<string, unknown>) => Promise<unknown>;
  return { invokeHttp, seen };
}

test("an event reaction in the generated host continues the publishing request", async () => {
  const { invokeHttp, seen } = generatedInvoke();
  const producer = { traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1 };
  await invokeEventFunction(
    "orders.notify",
    {
      instanceId: "event-1",
      eventId: "orders.placed",
      version: 1,
      payload: { orderId: "order-1" },
      occurredAt: "2026-11-14T00:00:00.000Z",
      publishedAt: "2026-11-14T00:00:00.000Z",
      attributes: {},
      propagation: {
        version: 2,
        producer,
        requestId: "request-1",
        originRequestId: "request-1",
        correlationId: "correlation-1",
      },
    } as never,
    {},
    { invoke: invokeHttp } as never,
  );
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({
    functionId: "orders.notify",
    source: "event-delivery",
    correlationId: "correlation-1",
    originRequestId: "request-1",
    links: [producer],
  });
});

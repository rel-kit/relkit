/**
 * The generated development server reports what functions did at run time (IN-29, IN-32): each
 * distinct dynamic call the engine observes becomes one observed edge with a count and the last
 * time it was seen, and each bucket and cache reports its provider's state.
 */
import { expect, test } from "bun:test";
import { Hono } from "../../packages/relkit/node_modules/hono";
import * as inspectorApi from "../../packages/relkit/src/inspector-api/index.ts";
import { inspectorEndpointsSource } from "../../packages/cli/src/commands/build-server-http-inspector.ts";
import { SERVER_INVOCATION_SOURCE } from "../../packages/cli/src/commands/build-server-invocation.ts";
import { SERVER_RUNTIME_SUPPORT_SOURCE } from "../../packages/cli/src/commands/build-server-runtime-support.ts";

const token = "fixture-private-token";
type Edge = { relationship: string; from: string; to: string };

/**
 * Evaluates the generated runtime support, invocation and inspector sources together, with an
 * engine `invoke` that reports the given edges as the engine does during one invocation.
 * @param options - Edges each invocation reports and the provider readiness.
 * @returns The inspector router and the generated `invokeHttp`.
 */
function host(options: { edges: readonly Edge[]; registry?: object; ready?: boolean }) {
  const app = new Hono();
  const plan = {
    jobs: [],
    events: [],
    buckets: [{ id: "orders.files", profile: "local" }],
    caches: [],
  };
  const registry = options.registry ?? {
    resolve: () => ({ value: {}, binding: { adapter: { features: [] } } }),
  };
  const graph = {
    nodes: [
      { kind: "function", id: "orders.place" },
      { kind: "bucket", id: "orders.files" },
    ],
    edges: [],
  };
  const invokeHttp = new Function(
    "app",
    "module",
    "providerStartup",
    "plan",
    "graph",
    "process",
    "invoke",
    "runtimeOwner",
    `
    const InspectorQueryError = module.InspectorQueryError;
    const runtimeManifest = { functions: {}, targets: {}, services: {} };
    const generationId = "test", graphHash = "sha256:test", activationFingerprint = undefined;
    const environment = "development", internalEndpointsEnabled = true;
    const runtimeIntegrationsPlan = {}, localServicesInspector = {};
    const telemetryConfiguration = {}, telemetry = { exportCounters: () => ({}), exporterStats: () => [] };
    const nativeJobsRuntimes = new Map(), registry = {}, values = {}, authRuntime = undefined;
    const shutdownController = new AbortController();
    const authRequestStorage = { getStore: () => undefined, run: (_auth, run) => run() };
    const runtimeState = () => runtimeOwner.snapshot();
    const targetFor = () => undefined, createDependencySources = () => ({});
    ${SERVER_RUNTIME_SUPPORT_SOURCE}
    ${SERVER_INVOCATION_SOURCE}
    ${inspectorEndpointsSource({ maxPreviewBytes: 1024 } as never).replace("installInspectorEndpoints(app,", "module.installInspectorEndpoints(app,")}
    return invokeHttp;
  `,
  )(
    app,
    inspectorApi,
    Promise.resolve(options.registry === undefined ? registry : undefined),
    plan,
    graph,
    { env: { RELKIT_INSPECTOR_SESSION_TOKEN: token } },
    async (invocation: { hooks: { onObservedEdge?: (edge: Edge) => void } }) => {
      for (const edge of options.edges) invocation.hooks.onObservedEdge?.(edge);
    },
    {
      track: (task: Promise<unknown>) => task,
      snapshot: () => ({ ready: { provider: options.ready ?? true }, stopping: false }),
    },
  ) as (request: Record<string, unknown>) => Promise<unknown>;
  return { app, invokeHttp };
}

/**
 * Reads one inspection route with the session token.
 * @param app - Generated inspector router.
 * @param path - Path below `/_relkit/v1`.
 * @returns The parsed body.
 */
async function read(app: Hono, path: string): Promise<Record<string, any>> {
  const response = await app.request(`/_relkit/v1${path}`, {
    headers: { "x-relkit-inspector-session-token": token },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, any>;
}

test("a function that writes a bucket and publishes an event shows both observed edges", async () => {
  const { app, invokeHttp } = host({
    edges: [
      { relationship: "uses-bucket", from: "orders.place", to: "orders.files" },
      { relationship: "uses-bucket", from: "orders.place", to: "orders.files" },
      { relationship: "publishes-event", from: "orders.place", to: "orders.placed" },
    ],
  });
  await invokeHttp({ functionId: "orders.place", input: {} });
  await invokeHttp({ functionId: "orders.place", input: {} });
  const detail = await read(app, "/functions/orders.place");
  expect(detail.observedEdges).toHaveLength(2);
  expect(detail.observedEdges).toContainEqual(
    expect.objectContaining({
      relationship: "uses-bucket",
      from: "orders.place",
      to: "orders.files",
      count: 4,
      lastSeenAt: expect.any(String),
    }),
  );
  expect(detail.observedEdges).toContainEqual(
    expect.objectContaining({ relationship: "publishes-event", to: "orders.placed", count: 2 }),
  );
  expect((await read(app, "/graph")).observedEdges).toHaveLength(2);
});

test("a bucket reports its provider's state", async () => {
  expect(
    (await read(host({ edges: [] }).app, "/runtime/buckets/orders.files")).state,
  ).toMatchObject({ id: "orders.files", state: "ready" });
  expect(
    (await read(host({ edges: [], ready: false }).app, "/runtime/buckets/orders.files")).state,
  ).toMatchObject({ state: "degraded" });
  const failed = host({ edges: [], registry: {} });
  expect((await read(failed.app, "/runtime/buckets/orders.files")).state).toMatchObject({
    id: "orders.files",
    state: "unavailable",
  });
});

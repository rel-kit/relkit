/**
 * Requests handled outside declared routes are attributed: the mounted Better Auth handler, the
 * generated server's `/healthz` probe and the framework RPC endpoint are recorded with stable
 * system route identifiers, and the route list can show them beside declared routes.
 */
import { expect, test } from "vitest";
import {
  createObservabilityCollector,
  SYSTEM_ROUTE_IDS,
  systemRouteNodes,
  type RequestRecord,
} from "../../src/observability/index.js";
import { createApp, type RuntimeManifest } from "../../src/runtime-hono/index.js";
import { instrumentHttpRequest } from "../../src/runtime-hono/http-span.js";
import type { RegistrationPlan } from "../../src/graph/index.js";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/app.ts", line: 1, column: 1 } as const;

test("a request handled by the mounted authentication handler names the auth route", async () => {
  const collector = createObservabilityCollector();
  const app = createApp({
    plan: authPlan(),
    manifest: {
      ...runtimeCohort("sha256:system-routes"),
      functions: {},
      middleware: {},
      requestTransforms: {},
      services: { auth: { handler: async () => new Response("session") } },
    } as RuntimeManifest,
    middleware: { observability: collector },
    engine: { invoke: async () => ({ ok: true }) },
  });
  const response = await app.request("http://localhost/api/auth/get-session");
  expect(await response.text()).toBe("session");
  expect(completed(collector, "/api/auth/get-session")).toMatchObject({
    routeId: SYSTEM_ROUTE_IDS.auth,
    functionId: "unknown",
    status: 200,
  });
});

test.each([
  ["/healthz", SYSTEM_ROUTE_IDS.health],
  ["/_relkit/v1/rpc/orders/list", SYSTEM_ROUTE_IDS.rpc],
])("a request to %s is recorded under %s", async (path, routeId) => {
  const collector = createObservabilityCollector();
  const response = await instrumentHttpRequest(
    new Request(`http://localhost${path}`),
    { observability: collector, generationId: "generation.test", graphHash: "sha256:test" },
    () => new Response("ok"),
  );
  await response.text();
  expect(completed(collector, path)?.routeId).toBe(routeId);
});

test("a declared route keeps its own identifier", async () => {
  const collector = createObservabilityCollector();
  const response = await instrumentHttpRequest(
    new Request("http://localhost/orders"),
    { observability: collector, generationId: "generation.test", graphHash: "sha256:test" },
    () => new Response("ok"),
  );
  await response.text();
  expect(completed(collector, "/orders")?.routeId).toBe("unknown");
});

test("the route list shows the system routes of a graph", () => {
  const nodes = systemRouteNodes({ nodes: authPlan().services ?? [] });
  expect(nodes.map((node) => [node.id, node.config.method, node.config.path])).toEqual([
    [SYSTEM_ROUTE_IDS.auth, "*", "/api/auth/*"],
    [SYSTEM_ROUTE_IDS.health, "GET", "/healthz"],
    [SYSTEM_ROUTE_IDS.rpc, "*", "/_relkit/v1/rpc/*"],
  ]);
  expect(nodes.every((node) => node.kind === "trigger" && node.system)).toBe(true);
  expect(systemRouteNodes({ nodes: [] }).map((node) => node.id)).toEqual([
    SYSTEM_ROUTE_IDS.health,
    SYSTEM_ROUTE_IDS.rpc,
  ]);
});

/** Finds the completed request record of a path. */
function completed(
  collector: ReturnType<typeof createObservabilityCollector>,
  path: string,
): Pick<RequestRecord, "routeId" | "functionId" | "status"> | undefined {
  return collector
    .read()
    .find(
      (record): record is Extract<typeof record, { signal: "request" }> =>
        record.signal === "request" && record.phase === "completed" && record.rawPath === path,
    );
}

/** A plan without declared routes and one Better Auth service RelKit mounts. */
function authPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:system-routes",
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
    services: [
      {
        kind: "service",
        id: "auth",
        source,
        functions: [],
        capability: {
          kind: "better-auth",
          basePath: "/api/auth",
          databaseServiceId: "",
          mount: true,
        },
      },
    ],
  } as unknown as RegistrationPlan;
}

/** Route JSON and Problem Details responses carry a length and safe default headers. */
import { expect, test } from "vitest";
import type { RegistrationPlan } from "../../src/graph/index.js";
import { createApp, type RuntimeManifest } from "../../src/runtime-hono/index.js";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/response-headers.test.ts", line: 1, column: 1 } as const;
const vehicles = { items: [{ id: "v1", plate: "AB-123" }] };

function app(routes: Record<string, unknown> = {}) {
  return createApp({
    plan: plan(),
    manifest: {
      ...runtimeCohort("sha256:response-headers"),
      functions: {},
      middleware: {},
      requestTransforms: {},
      routes,
    } satisfies RuntimeManifest,
    engine: { invoke: async () => vehicles },
  });
}

test("a JSON response carries its length, nosniff and no-store", async () => {
  const response = await app().request("http://localhost/vehicles");
  const body = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get("content-length")).toBe(
    String(new TextEncoder().encode(body).byteLength),
  );
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("HEAD reports the length of the GET body", async () => {
  const get = await app().request("http://localhost/vehicles");
  const head = await app().request("http://localhost/vehicles", { method: "HEAD" });

  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  expect(head.headers.get("content-length")).toBe(get.headers.get("content-length"));
  expect(Number(head.headers.get("content-length"))).toBeGreaterThan(0);
});

test("a route that declares its caching keeps its Cache-Control", async () => {
  const response = await app({
    "vehicles.list": { response: () => ({ headers: { "cache-control": "public, max-age=60" } }) },
  }).request("http://localhost/vehicles");

  expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});

test("a Problem Details response carries the same defaults", async () => {
  const response = await app().request("http://localhost/vehicles?limit=1&limit=2");
  const body = await response.text();

  expect(response.status).toBe(422);
  expect(response.headers.get("content-length")).toBe(
    String(new TextEncoder().encode(body).byteLength),
  );
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cache-control")).toBe("no-store");
});

function plan(): RegistrationPlan {
  return {
    graphHash: "sha256:response-headers",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "vehicles.list",
        source,
        triggerType: "http",
        targetFunctionId: "vehicles.list",
        config: {
          method: "GET",
          path: "/vehicles",
          request: {
            kind: "input",
            fields: { limit: { kind: "optional", value: { kind: "query", name: "limit" } } },
          },
          responses: [],
          middleware: [],
          transforms: [],
        },
      },
    ],
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
}

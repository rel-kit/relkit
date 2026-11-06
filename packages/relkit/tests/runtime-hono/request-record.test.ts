import { expect, test } from "vitest";
import { createObservabilityCollector } from "../../src/observability/index.js";
import type { RegistrationPlan } from "../../src/graph/index.js";
import { createApp, type RuntimeManifest } from "../../src/runtime-hono/index.js";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/request-record.test.ts", line: 1, column: 1 } as const;

test("records an error status returned without a thrown failure as a failed outcome", async () => {
  const collector = createObservabilityCollector();
  const app = createApp({
    plan: plan(),
    manifest: manifest(),
    generationId: "generation.test",
    observability: collector,
    middleware: { requestId: () => "request.missing" },
    engine: { invoke: async () => ({ ok: true }) },
  });

  const response = await app.request("http://localhost/missing");
  await response.text();
  const record = collector
    .read()
    .find(
      (value): value is Extract<typeof value, { signal: "request" }> =>
        value.signal === "request" && value.phase === "completed",
    );
  const span = collector
    .read()
    .find(
      (value): value is Extract<typeof value, { signal: "span" }> =>
        value.signal === "span" && value.status === "completed",
    );

  expect(response.status).toBe(404);
  expect(record).toMatchObject({ status: 404, outcome: "declared-error" });
  expect(span?.events?.map((event) => event.name)).toContain("http.declared-error");
  expect(span?.events?.map((event) => event.name)).not.toContain("http.success");
});

test("records a raw route's identity instead of an unknown route", async () => {
  const collector = createObservabilityCollector();
  const raw = plan();
  const { serviceId: _serviceId, ...trigger } = raw.httpTriggers[0]!;
  const app = createApp({
    plan: {
      ...raw,
      httpTriggers: [
        {
          ...trigger,
          id: "health.raw",
          targetFunctionId: "health.raw",
          config: { ...trigger.config, rawHandler: true },
        },
      ],
    },
    manifest: { ...manifest(), routes: { "health.raw": { handler: () => new Response("ok") } } },
    observability: collector,
    engine: { invoke: async () => undefined },
  });

  const response = await app.request("http://localhost/hello");
  await response.text();
  const record = collector
    .read()
    .find(
      (value): value is Extract<typeof value, { signal: "request" }> =>
        value.signal === "request" && value.phase === "completed",
    );

  expect(record).toMatchObject({ routeId: "health.raw", status: 200, outcome: "success" });
});

test("records a correlated HTTP timeline without request values", async () => {
  const collector = createObservabilityCollector();
  const app = createApp({
    plan: plan(),
    manifest: manifest(),
    generationId: "generation.test",
    observability: collector,
    middleware: {
      requestId: () => "request.test",
      traceId: () => "10000000000000000000000000000001",
    },
    engine: { invoke: async () => ({ ok: true }) },
  });

  const response = await app.request("http://localhost/hello?token=secret-value", {
    headers: { authorization: "Bearer secret-value" },
  });
  await response.text();
  const record = collector
    .read()
    .find(
      (value): value is Extract<typeof value, { signal: "request" }> =>
        value.signal === "request" && value.phase === "completed",
    );
  const spans = collector
    .read()
    .filter((value): value is Extract<typeof value, { signal: "span" }> => value.signal === "span");

  expect(response.status).toBe(200);
  expect(record).toMatchObject({
    requestId: "request.test",
    phase: "completed",
    traceId: "10000000000000000000000000000001",
    generationId: "generation.test",
    graphHash: "sha256:request-record",
    routeId: "hello.route",
    functionId: "hello",
    serviceId: "orders",
    status: 200,
    outcome: "success",
  });
  expect(
    spans.find((span) => span.status === "completed")?.events?.map((event) => event.name),
  ).toEqual([
    "http.received",
    "http.route.matched",
    "http.mapping.started",
    "http.mapping.completed",
    "http.validation.completed",
    "http.response.headers",
    "http.success",
  ]);
  expect(JSON.stringify(record)).not.toContain("secret-value");
});

test("records mapping failures as validation outcomes", async () => {
  const collector = createObservabilityCollector();
  const app = createApp({
    plan: plan({ request: { kind: "input", fields: { id: { kind: "query", name: "id" } } } }),
    manifest: manifest(),
    observability: collector,
    engine: { invoke: async () => ({ ok: true }) },
  });

  const response = await app.request("http://localhost/hello");
  await response.text();
  const record = collector
    .read()
    .find(
      (value): value is Extract<typeof value, { signal: "request" }> =>
        value.signal === "request" && value.phase === "completed",
    );

  expect(response.status).toBe(422);
  expect(record).toMatchObject({ status: 422, outcome: "validation-error" });
});

function plan(
  options: { readonly request?: import("../../src/contracts/index.js").JsonValue } = {},
): RegistrationPlan {
  return {
    graphHash: "sha256:request-record",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "hello.route",
        source,
        triggerType: "http",
        targetFunctionId: "hello",
        serviceId: "orders",
        config: {
          method: "GET",
          path: "/hello",
          request: options.request ?? { kind: "input", fields: {} },
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

function manifest(): RuntimeManifest {
  return {
    ...runtimeCohort("sha256:request-record"),
    functions: {},
    middleware: {},
    requestTransforms: {},
  };
}

test("answers unmatched paths with a 404 problem and wrong methods with a 405 problem and Allow", async () => {
  const app = createApp({
    plan: plan(),
    manifest: manifest(),
    engine: { invoke: async () => ({ ok: true }) },
  });

  const missing = await app.request("http://localhost/missing");
  expect(missing.status).toBe(404);
  expect(missing.headers.get("content-type")).toBe("application/problem+json");
  expect(await missing.json()).toEqual({
    type: "/errors/not-found",
    title: "Not Found",
    status: 404,
    code: "not-found",
    detail: "No route matches this request.",
    traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
  });

  const wrongMethod = await app.request("http://localhost/hello", { method: "DELETE" });
  expect(wrongMethod.status).toBe(405);
  expect(wrongMethod.headers.get("allow")).toBe("GET, HEAD");
  expect(await wrongMethod.json()).toMatchObject({
    status: 405,
    code: "method-not-allowed",
    detail: "This path does not accept DELETE; it accepts GET, HEAD.",
  });
});

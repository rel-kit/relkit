import { expect, test } from "bun:test";
import {
  createObservabilityCollector,
  type RequestRecord,
  type SpanRecord,
} from "@relkit/observability";
import type { RegistrationPlan } from "@relkit/graph";
import { createApp, type RuntimeManifest } from "./src/index.js";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/request-record.test.ts", line: 1, column: 1 } as const;

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
      (value): value is RequestRecord => value.signal === "request" && value.phase === "completed",
    );
  const spans = collector.read().filter((value): value is SpanRecord => value.signal === "span");

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
      (value): value is RequestRecord => value.signal === "request" && value.phase === "completed",
    );

  expect(response.status).toBe(422);
  expect(record).toMatchObject({ status: 422, outcome: "validation-error" });
});

function plan(options: { readonly request?: unknown } = {}): RegistrationPlan {
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

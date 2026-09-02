import { expect, test } from "bun:test";
import { createObservabilityCollector, type RequestRecord } from "@relkit/observability";
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
    middleware: { requestId: () => "request.test", traceId: () => "trace.test" },
    engine: { invoke: async () => ({ ok: true }) },
  });

  const response = await app.request("http://localhost/hello?token=secret-value", {
    headers: { authorization: "Bearer secret-value" },
  });
  const record = collector
    .read()
    .find((value): value is RequestRecord => value.signal === "request");

  expect(response.status).toBe(200);
  expect(record).toMatchObject({
    requestId: "request.test",
    traceId: "trace.test",
    generationId: "generation.test",
    graphHash: "sha256:request-record",
    routeId: "hello.route",
    functionId: "hello",
    serviceId: "orders",
    status: 200,
    outcome: "success",
  });
  expect(record?.timeline.map(({ kind }) => kind)).toEqual([
    "accepted",
    "match",
    "mapping",
    "function",
    "response",
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
  const record = collector
    .read()
    .find((value): value is RequestRecord => value.signal === "request");

  expect(response.status).toBe(422);
  expect(record).toMatchObject({ status: 422, outcome: "validation-error" });
  expect(record?.timeline.map(({ kind }) => kind)).toEqual([
    "accepted",
    "match",
    "mapping",
    "response",
  ]);
  expect(record?.timeline.at(-1)?.outcome).toBe("validation-error");
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

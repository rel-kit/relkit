/** The framework's own early answers are recorded as refused, a route's own answers keep theirs. */
import { expect, test } from "vitest";
import { createObservabilityCollector } from "../../src/observability/index.js";
import type { RegistrationPlan } from "../../src/graph/index.js";
import { createApp, type RuntimeManifest } from "../../src/runtime-hono/index.js";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/request-record-refused.test.ts", line: 1, column: 1 } as const;

const plan: RegistrationPlan = {
  graphHash: "sha256:request-record-refused",
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
        method: "POST",
        path: "/hello",
        request: { kind: "input", fields: {} },
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

const manifest: RuntimeManifest = {
  ...runtimeCohort("sha256:request-record-refused"),
  functions: {},
  middleware: {},
  requestTransforms: {},
};

/** Sends one request and returns the completed request record it left. */
async function completed(init: RequestInit & { readonly path: string }) {
  const collector = createObservabilityCollector();
  const app = createApp({
    plan,
    manifest,
    generationId: "generation.test",
    observability: collector,
    middleware: { maxBodyBytes: 16 },
    engine: { invoke: async () => ({ ok: true }) },
  });
  const response = await app.request(`http://localhost${init.path}`, init);
  await response.text();
  return collector
    .read()
    .find(
      (value): value is Extract<typeof value, { signal: "request" }> =>
        value.signal === "request" && value.phase === "completed",
    );
}

test("an unmatched path, a wrong method and an oversize body are refused", async () => {
  expect(await completed({ path: "/missing" })).toMatchObject({ status: 404, outcome: "refused" });
  expect(await completed({ path: "/hello", method: "DELETE" })).toMatchObject({
    status: 405,
    outcome: "refused",
  });
  expect(
    await completed({
      path: "/hello",
      method: "POST",
      body: JSON.stringify({ text: "x".repeat(64) }),
      headers: { "content-type": "application/json" },
    }),
  ).toMatchObject({ status: 413, outcome: "refused" });
});

test("a call to an RPC procedure the endpoint does not serve is refused", async () => {
  expect(
    await completed({
      path: "/_relkit/v1/rpc/no.such.procedure",
      method: "POST",
      body: JSON.stringify({ json: {} }),
      headers: { "content-type": "application/json" },
    }),
  ).toMatchObject({ status: 404, outcome: "refused", routeId: "relkit.rpc" });
});

test("a routed request keeps the outcome its route produced", async () => {
  expect(
    await completed({
      path: "/hello",
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    }),
  ).toMatchObject({ status: 200, outcome: "success", routeId: "hello.route" });
});

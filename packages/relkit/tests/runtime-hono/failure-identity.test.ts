/** A failed request's span names the declared error or the validation issues, never input values. */
import { expect, test } from "vitest";
import { createObservabilityCollector } from "../../src/observability/index.js";
import type { RegistrationPlan } from "../../src/graph/index.js";
import { createApp, type RuntimeManifest } from "../../src/runtime-hono/index.js";
import { applicationFailure } from "../../src/runtime-effect/index.js";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/failure-identity.test.ts", line: 1, column: 1 } as const;

async function requestSpan(invoke: () => Promise<unknown>, path: string) {
  const collector = createObservabilityCollector();
  const app = createApp({
    plan: plan(),
    manifest: {
      ...runtimeCohort("sha256:failure-identity"),
      functions: {},
      middleware: {},
      requestTransforms: {},
    } satisfies RuntimeManifest,
    observability: collector,
    engine: { invoke },
  });
  const response = await app.request(`http://localhost${path}`, { method: "POST" });
  await response.text();
  const span = collector
    .read()
    .find(
      (value): value is Extract<typeof value, { signal: "span" }> =>
        value.signal === "span" && value.status === "completed",
    );
  return { response, span };
}

test("a 409 names the declared error identifier on the request span", async () => {
  const { response, span } = await requestSpan(
    async () =>
      Promise.reject(
        applicationFailure({ id: "fleet.plate-taken", message: "Plate taken.", data: {} }),
      ),
    "/vehicles?id=v1&plate=AB-1",
  );

  expect(response.status).toBe(409);
  expect(span?.attributes).toMatchObject({ "relkit.error.id": "fleet.plate-taken" });
});

test("a 422 lists each issue's code and path on the validation event, without values", async () => {
  const { response, span } = await requestSpan(
    async () => ({ ok: true }),
    "/vehicles?other=x1y2z3",
  );

  expect(response.status).toBe(422);
  const event = span?.events?.find((value) => value.name === "http.validation.failed");
  expect(event?.attributes).toEqual({
    "relkit.validation.issue_count": 2,
    "relkit.validation.issues.0.code": "missing",
    "relkit.validation.issues.0.path": "id",
    "relkit.validation.issues.1.code": "missing",
    "relkit.validation.issues.1.path": "plate",
  });
  expect(JSON.stringify(span)).not.toContain("x1y2z3");
});

function plan(): RegistrationPlan {
  return {
    graphHash: "sha256:failure-identity",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "vehicles.create",
        source,
        triggerType: "http",
        targetFunctionId: "vehicles.create",
        config: {
          method: "POST",
          path: "/vehicles",
          request: {
            kind: "input",
            fields: {
              id: { kind: "query", name: "id" },
              plate: { kind: "query", name: "plate" },
            },
          },
          responses: [
            { kind: "error", id: "plate-taken", errorId: "fleet.plate-taken", status: 409 },
          ],
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

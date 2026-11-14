/** Internal failures stay out of the response and are recorded, redacted, in the log and the trace. */
import { expect, test } from "vitest";
import { createObservabilityCollector } from "../../src/observability/index.js";
import type { RegistrationPlan } from "../../src/graph/index.js";
import { createApp, type RuntimeManifest } from "../../src/runtime-hono/index.js";
import { providerFailure, unexpectedDefect } from "../../src/runtime-effect/index.js";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/failure-recording.test.ts", line: 1, column: 1 } as const;
const traceId = "10000000000000000000000000000001";

/** A database driver error whose message carries the query and its bound parameters. */
class DrizzleQueryError extends Error {
  override readonly name = "DrizzleQueryError";
}

function driverError(): Error {
  return new DrizzleQueryError(
    'Failed query: insert into "vehicles" ("plate") values ($1)\nparams: AB-secret-123',
  );
}

async function run(mode: "development" | "production", failure: unknown) {
  const collector = createObservabilityCollector();
  const app = createApp({
    plan: plan(),
    manifest: manifest(),
    observability: collector,
    responseMapping: { mode },
    middleware: { requestId: () => "request.failed", traceId: () => traceId },
    engine: { invoke: async () => Promise.reject(failure) },
  });
  const response = await app.request("http://localhost/vehicles", { method: "POST" });
  const body = await response.text();
  const records = collector.read();
  // Framework operation logs name the failed operation; the cause record is the one with exception fields.
  const logs = records.filter(
    (value): value is Extract<typeof value, { signal: "log" }> =>
      value.signal === "log" &&
      value.level === "error" &&
      value.fields["exception.type"] !== undefined,
  );
  const span = records.find(
    (value): value is Extract<typeof value, { signal: "span" }> =>
      value.signal === "span" && value.status === "completed",
  );
  return { response, body, logs, span };
}

test.each(["development", "production"] as const)(
  "a driver error leaves nothing of its cause in the %s response body",
  async (mode) => {
    const { response, body } = await run(mode, unexpectedDefect(driverError()));
    expect(response.status).toBe(500);
    expect(JSON.parse(body)).toMatchObject({
      code: "internal-error",
      detail: "The request failed unexpectedly.",
    });
    expect(body).not.toContain("Failed query");
    expect(body).not.toContain("AB-secret-123");
  },
);

test("a provider failure keeps its message out of the development response", async () => {
  const { response, body } = await run(
    "development",
    providerFailure(new Error("S3 put failed: InvalidAccessKeyId")),
  );
  expect(response.status).toBe(502);
  expect(JSON.parse(body)).toMatchObject({ detail: "A dependency of this request failed." });
  expect(body).not.toContain("InvalidAccessKeyId");
});

test("development records the redacted cause once in the error log and on the request span", async () => {
  const { logs, span } = await run("development", unexpectedDefect(driverError()));

  expect(logs).toHaveLength(1);
  const log = logs[0]!;
  expect(log).toMatchObject({ requestId: "request.failed", traceId });
  expect(log.spanId).toMatch(/^[0-9a-f]{16}$/);
  expect(log.fields).toMatchObject({
    "exception.type": "DrizzleQueryError",
    "relkit.error.code": "RELKIT_UNEXPECTED_DEFECT",
  });
  expect(String(log.fields["exception.message"])).toContain(
    'Failed query: insert into "vehicles" ("plate") values ($1)',
  );
  expect(JSON.stringify(log)).not.toContain("AB-secret-123");

  const exception = span?.events?.find((event) => event.name === "exception");
  expect(exception?.attributes).toMatchObject({ "exception.type": "DrizzleQueryError" });
  expect(String(exception?.attributes?.["exception.message"])).toContain("Failed query");
  expect(String(exception?.attributes?.["exception.stacktrace"])).toContain("DrizzleQueryError");
  expect(JSON.stringify(span)).not.toContain("AB-secret-123");
});

test("production records only the failure's identity, without message text", async () => {
  const { logs, span } = await run("production", unexpectedDefect(driverError()));

  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({ requestId: "request.failed", traceId });
  expect(logs[0]!.fields).toMatchObject({
    "exception.type": "UnexpectedDefect",
    "relkit.error.code": "RELKIT_UNEXPECTED_DEFECT",
  });
  expect(JSON.stringify(logs)).not.toContain("Failed query");
  const exception = span?.events?.find((event) => event.name === "exception");
  expect(exception?.attributes).toEqual({ "exception.type": "UnexpectedDefect" });
  expect(JSON.stringify(span)).not.toContain("Failed query");
});

function plan(): RegistrationPlan {
  return {
    graphHash: "sha256:failure-recording",
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
}

function manifest(): RuntimeManifest {
  return {
    ...runtimeCohort("sha256:failure-recording"),
    functions: {},
    middleware: {},
    requestTransforms: {},
  };
}

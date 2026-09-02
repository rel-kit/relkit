import { describe, expect, test } from "bun:test";
import { InvocationValidationError } from "@relkit/engine";
import type { HttpTriggerRegistration, RegistrationPlan } from "@relkit/graph";
import {
  applicationFailure,
  cancellationFailure,
  providerFailure,
  timeoutFailure,
  unexpectedDefect,
} from "@relkit/runtime-effect";
import { z } from "@relkit/schema";
import { createApp } from "./src/create-app.js";
import {
  mapFailureResponse,
  mapInputValidationResponse,
  mapSuccessResponse,
} from "./src/response-mapping.js";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/routes.ts", line: 1, column: 1 };

function trigger(responses: readonly Record<string, unknown>[]): HttpTriggerRegistration {
  return {
    kind: "trigger",
    id: "orders.route",
    source,
    triggerType: "http",
    targetFunctionId: "orders.get",
    config: {
      method: "GET",
      path: "/orders",
      request: { kind: "input", fields: {} },
      responses,
      middleware: [],
      transforms: [],
    },
  } as unknown as HttpTriggerRegistration;
}

function plan(route: HttpTriggerRegistration): RegistrationPlan {
  return {
    graphHash: "sha256:test",
    functions: [],
    httpTriggers: [route],
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

describe("HTTP response mapping", () => {
  test("maps successful values with the declared status", async () => {
    const response = await mapSuccessResponse(
      trigger([{ kind: "success", id: "success.201", status: 201 }]),
      { id: "order-1" },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "order-1" });
  });

  test("validates executable response schemas outside production", async () => {
    const response = trigger([
      { kind: "success", id: "success.200", status: 200, schema: z.object({ ok: z.boolean() }) },
    ]);

    const invalid = await mapSuccessResponse(response, { ok: "wrong" }, { mode: "test" });
    expect(invalid.status).toBe(500);
    expect(await invalid.json()).toEqual({ error: "internal-error" });

    const production = await mapSuccessResponse(response, { ok: "wrong" }, { mode: "production" });
    expect(production.status).toBe(200);
    expect(await production.json()).toEqual({ ok: "wrong" });
  });

  test("maps declared errors and excludes their causes", async () => {
    const response = await mapFailureResponse(
      trigger([
        {
          kind: "error",
          id: "error.orders.missing.404",
          errorId: "orders.missing",
          status: 404,
          schema: z.object({ orderId: z.string() }),
        },
      ]),
      applicationFailure({
        id: "orders.missing",
        message: "Order not found",
        data: { orderId: "order-1" },
        cause: new Error("database-password"),
      }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({
      kind: "application",
      outcome: "declared-error",
      code: "orders.missing",
      message: "Order not found",
      data: { orderId: "order-1" },
      retry: "never",
    });
    expect(response.headers.get("Retry-After")).toBeNull();
    expect(JSON.stringify(body)).not.toContain("database-password");
  });

  test("keeps legacy retryable errors without a delay hint headerless", async () => {
    const response = await mapFailureResponse(
      trigger([{ kind: "error", id: "busy.response", errorId: "orders.busy", status: 503 }]),
      applicationFailure({
        id: "orders.busy",
        message: "Order service is busy",
        data: {},
        retry: "later",
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBeNull();
    expect(await response.json()).toMatchObject({ retry: "later" });
  });

  test("maps input validation to a safe declared validation response", async () => {
    const response = await mapInputValidationResponse(
      trigger([{ kind: "validation-error", id: "validation.422", status: 422 }]),
      [{ message: "Expected an order id", path: [{ key: "id" }] }],
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "validation",
      issues: [{ code: "validation", message: "Expected an order id", path: ["id"] }],
    });
  });

  test.each([
    ["provider", providerFailure(new Error("provider-secret")), 502, "provider-failure"],
    ["timeout", timeoutFailure(new Error("timeout-secret")), 504, "timeout"],
    ["cancelled", cancellationFailure(new Error("cancel-secret")), 499, "cancelled"],
    ["defect", unexpectedDefect(new Error("defect-secret")), 500, "internal-error"],
  ] as const)("maps %s without leaking details", async (_name, failure, status, error) => {
    const response = await mapFailureResponse(trigger([]), failure);

    expect(response.status).toBe(status);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error });
    expect(body).not.toContain("secret");
  });

  test("returns redacted provider response details in development", async () => {
    const failure = providerFailure(
      new Error("S3 put failed with status 403: InvalidAccessKeyId: password=provider-secret"),
    );
    const response = await mapFailureResponse(trigger([]), failure, { mode: "development" });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "provider-failure",
      message: "S3 put failed with status 403: InvalidAccessKeyId: password=[REDACTED]",
    });

    const production = await mapFailureResponse(trigger([]), failure, { mode: "production" });
    expect(await production.json()).toEqual({ error: "provider-failure" });
  });

  test("maps engine failures through the materialized route", async () => {
    const route = trigger([{ kind: "response", id: "timeout", status: 504 }]);
    const app = createApp({
      plan: plan(route),
      manifest: {
        ...runtimeCohort("sha256:test"),
        functions: {},
        middleware: {},
        requestTransforms: {},
      },
      engine: { invoke: async () => Promise.reject(timeoutFailure(new Error("secret"))) },
    });

    const response = await app.request("http://localhost/orders");
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "timeout" });
  });

  test("rounds retry delay up without invoking the route twice", async () => {
    let invocations = 0;
    const route = trigger([
      { kind: "error", id: "busy.response", errorId: "orders.busy", status: 503 },
    ]);
    const app = createApp({
      plan: plan(route),
      manifest: {
        ...runtimeCohort("sha256:test"),
        functions: {},
        middleware: {},
        requestTransforms: {},
      },
      engine: {
        invoke: async () => {
          invocations += 1;
          throw applicationFailure({
            id: "orders.busy",
            message: "Order service is busy",
            data: {},
            retry: { kind: "later", afterMs: 1_500 },
          });
        },
      },
    });

    const response = await app.request("http://localhost/orders");

    expect(invocations).toBe(1);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("2");
    expect(await response.json()).toMatchObject({ retry: "later", afterMs: 1_500 });
  });

  test("treats output validation failures as defects", async () => {
    const response = await mapFailureResponse(
      trigger([]),
      new InvocationValidationError("output", [{ message: "bad output" }]),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal-error" });
  });
});

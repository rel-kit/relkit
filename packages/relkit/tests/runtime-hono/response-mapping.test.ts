import { describe, expect, test, vi } from "vitest";
import { InvocationValidationError } from "../../src/engine/index.js";
import { RuntimeFailure } from "../../src/invocation/index.js";
import type { HttpTriggerRegistration, RegistrationPlan } from "../../src/graph/index.js";
import {
  applicationFailure,
  cancellationFailure,
  providerFailure,
  timeoutFailure,
  unexpectedDefect,
} from "../../src/runtime-effect/index.js";
import { z } from "../../src/schema/index.js";
import { createApp } from "../../src/runtime-hono/create-app.js";
import {
  mapFailureResponse,
  mapInputValidationResponse,
  mapSuccessResponse,
} from "../../src/runtime-hono/response-mapping.js";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/routes.ts", line: 1, column: 1 };

const titles: Record<number, string> = {
  404: "Not Found",
  422: "Unprocessable Content",
  499: "Client Closed Request",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/** The Problem Details body the runtime returns for one error. */
function problem(status: number, code: string, detail: string, extra: object = {}) {
  return { type: `/errors/${code}`, title: titles[status], status, code, detail, ...extra };
}

const internalError = problem(500, "internal-error", "The request failed unexpectedly.");

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
    channels: [],
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
    expect(invalid.headers.get("content-type")).toBe("application/problem+json");
    expect(await invalid.json()).toEqual(internalError);

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
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(body).toEqual(
      problem(404, "orders.missing", "Order not found", { data: { orderId: "order-1" } }),
    );
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
    expect(await response.json()).toEqual(
      problem(503, "orders.busy", "Order service is busy", { data: {} }),
    );
  });

  test("maps input validation to a safe declared validation response", async () => {
    const response = await mapInputValidationResponse(
      trigger([{ kind: "validation-error", id: "validation.422", status: 422 }]),
      [{ message: "Expected an order id", path: [{ key: "id" }] }],
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual(
      problem(422, "validation", "The request input is invalid.", {
        issues: [{ code: "validation", message: "Expected an order id", path: ["id"] }],
      }),
    );
  });

  test.each([
    [
      "provider",
      providerFailure(new Error("provider-secret")),
      502,
      "provider-failure",
      "A dependency of this request failed.",
    ],
    [
      "timeout",
      timeoutFailure(new Error("timeout-secret")),
      504,
      "timeout",
      "The request timed out.",
    ],
    [
      "cancelled",
      cancellationFailure(new Error("cancel-secret")),
      499,
      "cancelled",
      "The request was cancelled.",
    ],
    [
      "defect",
      unexpectedDefect(new Error("defect-secret")),
      500,
      "internal-error",
      "The request failed unexpectedly.",
    ],
  ] as const)("maps %s without leaking details", async (_name, failure, status, code, detail) => {
    const response = await mapFailureResponse(trigger([]), failure);

    expect(response.status).toBe(status);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual(problem(status, code, detail));
    expect(body).not.toContain("secret");
  });

  test("returns redacted provider response details in development", async () => {
    const failure = providerFailure(
      new Error("S3 put failed with status 403: InvalidAccessKeyId: password=provider-secret"),
    );
    const response = await mapFailureResponse(trigger([]), failure, { mode: "development" });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual(
      problem(
        502,
        "provider-failure",
        "S3 put failed with status 403: InvalidAccessKeyId: password=[REDACTED]",
      ),
    );

    const production = await mapFailureResponse(trigger([]), failure, { mode: "production" });
    expect(await production.json()).toEqual(
      problem(502, "provider-failure", "A dependency of this request failed."),
    );
  });

  test("names the redacted defect cause in development only", async () => {
    const failure = unexpectedDefect(new Error("no such table: user; password=defect-secret"));

    const development = await mapFailureResponse(trigger([]), failure, { mode: "development" });
    expect(development.status).toBe(500);
    expect(await development.json()).toEqual(
      problem(500, "internal-error", "no such table: user; password=[REDACTED]"),
    );

    const production = await mapFailureResponse(trigger([]), failure, { mode: "production" });
    expect(await production.json()).toEqual(internalError);
  });

  // A bundled server and an external runtime-hono each load their own @relkit/invocation.
  test("maps failures created by another package copy to their declared responses", async () => {
    vi.resetModules();
    const copy = await import("../../src/invocation/index.js");
    expect(copy.RuntimeFailure).not.toBe(RuntimeFailure);
    const route = trigger([
      {
        kind: "error",
        id: "error.auth.unauthenticated.401",
        errorId: "auth.unauthenticated",
        status: 401,
      },
      { kind: "validation-error", id: "validation.422", status: 422 },
    ]);

    const declared = await mapFailureResponse(
      route,
      copy.applicationFailure({
        id: "auth.unauthenticated",
        message: "Sign in to continue",
        data: {},
      }),
      { mode: "development" },
    );
    expect(declared.status).toBe(401);
    expect(await declared.json()).toMatchObject({ code: "auth.unauthenticated" });

    const invalid = await mapFailureResponse(
      route,
      new copy.InvocationValidationError("input", [{ message: "Too large", path: ["limit"] }]),
      { mode: "development" },
    );
    expect(invalid.status).toBe(422);
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
    const body = await response.json();
    expect(body).toEqual({
      ...problem(504, "timeout", "The request timed out."),
      traceId: response.headers.get("x-trace-id") ?? expect.stringMatching(/^[0-9a-f]{32}$/),
    });
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
    expect(await response.json()).toMatchObject(
      problem(503, "orders.busy", "Order service is busy", { data: {} }),
    );
  });

  test("treats output validation failures as defects", async () => {
    const response = await mapFailureResponse(
      trigger([]),
      new InvocationValidationError("output", [{ message: "bad output" }]),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(internalError);
  });
});

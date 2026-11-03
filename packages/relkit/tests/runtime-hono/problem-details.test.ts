/** Requires every route error the HTTP runtime produces to be an RFC 9457 Problem Details response. */
import { expect, test } from "vitest";
import { InvocationValidationError } from "../../src/engine/index.js";
import type { HttpTriggerRegistration, RegistrationPlan } from "../../src/graph/index.js";
import {
  applicationFailure,
  cancellationFailure,
  timeoutFailure,
} from "../../src/runtime-effect/index.js";
import { createHttpAuthRuntime } from "../../src/runtime-hono/auth.ts";
import { createApp, type RuntimeManifest } from "../../src/runtime-hono/index.js";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/routes/problems/route.ts", line: 1, column: 1 } as const;
const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";

/** One GET route whose target fails the way its name says. */
function route(
  path: string,
  extra: Partial<HttpTriggerRegistration["config"]> = {},
): HttpTriggerRegistration {
  return {
    kind: "trigger",
    id: `problems${path.replaceAll("/", ".")}.http`,
    source,
    triggerType: "http",
    targetFunctionId: path.slice(1),
    config: {
      method: "GET",
      path,
      request: { kind: "input", fields: {} },
      responses: [],
      middleware: [],
      transforms: [],
      ...extra,
    },
  } as HttpTriggerRegistration;
}

function plan(): RegistrationPlan {
  return {
    graphHash: "sha256:problems",
    functions: [],
    httpTriggers: [
      route("/declared", {
        responses: [
          { kind: "error", id: "error.orders.busy.503", errorId: "orders.busy", status: 503 },
        ],
      }),
      route("/validation"),
      route("/limited", {
        rateLimit: { limit: 1, windowMs: 60_000, key: { kind: "constant", value: "all" } },
      }),
      route("/timeout"),
      route("/cancelled"),
      route("/defect"),
      route("/account"),
      { ...route("/write"), config: { ...route("/write").config, method: "POST" } },
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
  } as RegistrationPlan;
}

function manifest(): RuntimeManifest {
  return {
    ...runtimeCohort("sha256:problems"),
    functions: {},
    middleware: {},
    requestTransforms: {},
  };
}

const failures: Record<string, () => unknown> = {
  declared: () =>
    applicationFailure({
      id: "orders.busy",
      message: "Order service is busy",
      data: { queue: "orders" },
      retry: { kind: "later", afterMs: 2_500 },
    }),
  validation: () =>
    new InvocationValidationError("input", [{ message: "Expected a number", path: ["limit"] }]),
  timeout: () => timeoutFailure(new Error("deadline-secret")),
  cancelled: () => cancellationFailure(new Error("cancel-secret")),
  defect: () => new Error("defect-secret"),
};

const app = createApp({
  plan: plan(),
  manifest: manifest(),
  internalEndpoints: { mode: "production" },
  responseMapping: { mode: "production" },
  auth: createHttpAuthRuntime({
    protected: ["/account"],
    publicPaths: [],
    getSession: async () => null,
  }),
  transportSecurity: { allowedOrigins: ["https://app.example"] },
  engine: {
    invoke: async ({ functionId }) => {
      const failure = failures[functionId];
      if (failure !== undefined) throw failure();
      return { ok: true };
    },
  },
});

/** Requests one path with a known trace ID. */
function request(path: string, init: RequestInit = {}): Promise<Response> {
  return app.request(`https://app.example${path}`, {
    ...init,
    headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01`, ...init.headers },
  });
}

/** Reads a Problem Details response and checks the fields every problem has. */
async function problem(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toBe("application/problem+json");
  const body = await response.json();
  expect(body).toMatchObject({ type: `/errors/${code}`, status, code, traceId });
  expect(typeof body.title).toBe("string");
  expect(typeof body.detail).toBe("string");
  expect(JSON.stringify(body)).not.toContain("secret");
  return body;
}

test("a declared error is a problem with its code, data and Retry-After", async () => {
  const response = await request("/declared");
  expect(response.headers.get("retry-after")).toBe("3");
  expect(await problem(response, 503, "orders.busy")).toEqual({
    type: "/errors/orders.busy",
    title: "Service Unavailable",
    status: 503,
    code: "orders.busy",
    detail: "Order service is busy",
    data: { queue: "orders" },
    traceId,
  });
});

test("invalid input is a 422 validation problem with issue paths", async () => {
  const body = await problem(await request("/validation"), 422, "validation");
  expect(body.issues).toEqual([
    { code: "validation", message: "Expected a number", path: ["limit"] },
  ]);
});

test("a rate-limited request is a 429 problem with Retry-After", async () => {
  expect((await request("/limited")).status).toBe(200);
  const limited = await request("/limited");
  expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  const body = await problem(limited, 429, "rate-limited");
  expect(body.data.retryAfterMs).toBeGreaterThan(0);
});

test.each([
  ["/timeout", 504, "timeout"],
  ["/cancelled", 499, "cancelled"],
  ["/defect", 500, "internal-error"],
] as const)("%s is a %i problem without internal detail", async (path, status, code) => {
  await problem(await request(path), status, code);
});

test("a protected route without a session is a 401 problem", async () => {
  await problem(await request("/account"), 401, "unauthenticated");
});

test("a request the transport policy rejects is a 403 problem", async () => {
  const response = await request("/write", {
    method: "POST",
    headers: { origin: "https://elsewhere.example" },
  });
  await problem(response, 403, "origin-denied");
});

test("unmatched routes are 404 and 405 problems", async () => {
  await problem(await request("/missing"), 404, "not-found");
  const wrongMethod = await request("/declared", {
    method: "DELETE",
    headers: { origin: "https://app.example" },
  });
  expect(wrongMethod.headers.get("allow")).toBe("GET, HEAD");
  await problem(wrongMethod, 405, "method-not-allowed");
});

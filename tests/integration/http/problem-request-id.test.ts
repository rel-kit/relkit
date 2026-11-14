/** Requires every Problem Details body the HTTP runtime sends to carry the request ID of its
 * `x-request-id` header, whichever layer produced it: shell, middleware, mapping or route. */
import { expect, test } from "bun:test";
import { InvocationValidationError } from "relkit/engine";
import type { HttpTriggerRegistration, RegistrationPlan } from "relkit/graph";
import { applicationFailure } from "relkit/runtime-effect";
import { createApp, createHttpAuthRuntime, type RuntimeManifest } from "relkit/runtime-hono";
import { runtimeCohort } from "../runtime-cohort.ts";

const source = { file: "src/routes/problems/route.ts", line: 1, column: 1 } as const;
const origin = "https://app.example";

/** One function route; its target fails the way the engine stub below says. */
function route(
  id: string,
  method: string,
  path: string,
  config: Record<string, unknown> = {},
): HttpTriggerRegistration {
  return {
    kind: "trigger",
    id: `${id}.http`,
    source,
    triggerType: "http",
    targetFunctionId: id,
    config: {
      method,
      path,
      request: { kind: "input", fields: {} },
      responses: [],
      middleware: [],
      transforms: [],
      ...config,
    },
  } as unknown as HttpTriggerRegistration;
}

const plan = {
  graphHash: "sha256:problem-request-id",
  functions: [],
  httpTriggers: [
    route("account", "GET", "/account", { auth: { kind: "required" } }),
    route("conflict", "POST", "/conflict", {
      responses: [
        { kind: "error", id: "orders.conflict.409", errorId: "orders.conflict", status: 409 },
      ],
    }),
    route("upload", "POST", "/upload", {
      request: { kind: "input", fields: { body: { kind: "whole-body" } } },
      maxBodyBytes: 4,
    }),
    route("invalid", "GET", "/invalid"),
    route("limited", "GET", "/limited", {
      rateLimit: { limit: 1, windowMs: 60_000, key: { kind: "constant", value: "all" } },
    }),
    route("defect", "GET", "/defect"),
    route("shaped", "GET", "/shaped"),
    route("write", "POST", "/write"),
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
} as unknown as RegistrationPlan;

const failures: Record<string, () => unknown> = {
  conflict: () => applicationFailure({ id: "orders.conflict", message: "Order already exists" }),
  invalid: () =>
    new InvocationValidationError("input", [{ message: "Expected a number", path: ["limit"] }]),
  defect: () => new Error("defect-secret"),
};

const manifest: RuntimeManifest = {
  ...runtimeCohort(plan.graphHash),
  functions: {},
  middleware: {},
  requestTransforms: {},
  routes: {
    // The route's `response` option fails after the function succeeded.
    "shaped.http": {
      response: () => {
        throw new Error("response-option-secret");
      },
    },
  },
} as RuntimeManifest;

const app = createApp({
  plan,
  manifest,
  middleware: { maxBodyBytes: 64 },
  responseMapping: { mode: "development" },
  auth: createHttpAuthRuntime({ getSession: async () => null }),
  transportSecurity: { allowedOrigins: [origin] },
  engine: {
    invoke: async ({ functionId }) => {
      const failure = failures[functionId];
      if (failure !== undefined) throw failure();
      return { ok: true };
    },
  },
});

/** Sends one request from the allowed origin unless the case overrides it. */
async function send(path: string, init: RequestInit = {}): Promise<Response> {
  return await app.request(`${origin}${path}`, {
    ...init,
    headers: { origin, ...(init.headers as Record<string, string> | undefined) },
  });
}

const json = { "content-type": "application/json" };

const cases: readonly (readonly [string, number, string, () => Promise<Response>])[] = [
  ["no session", 401, "unauthenticated", () => send("/account")],
  [
    "foreign origin",
    403,
    "origin-denied",
    () => send("/write", { method: "POST", headers: { origin: "https://evil.example" } }),
  ],
  ["unknown path", 404, "not-found", () => send("/missing")],
  ["wrong method", 405, "method-not-allowed", () => send("/account", { method: "DELETE" })],
  ["declared conflict", 409, "orders.conflict", () => send("/conflict", { method: "POST" })],
  [
    "body over the server limit",
    413,
    "payload-too-large",
    () => send("/write", { method: "POST", headers: json, body: JSON.stringify("x".repeat(100)) }),
  ],
  [
    "body over the route limit",
    413,
    "payload-too-large",
    () => send("/upload", { method: "POST", headers: json, body: '"12345"' }),
  ],
  ["invalid input", 422, "validation", () => send("/invalid")],
  [
    "rate limited",
    429,
    "rate-limited",
    async () => {
      await (await send("/limited")).text();
      return await send("/limited");
    },
  ],
  ["handler defect", 500, "internal-error", () => send("/defect")],
  ["failing response option", 500, "internal-error", () => send("/shaped")],
];

test.each(cases)("%s: %i problem carries the x-request-id", async (_name, status, code, run) => {
  const response = await run();
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toBe("application/problem+json");
  const requestId = response.headers.get("x-request-id");
  expect(requestId).toEqual(expect.any(String));
  const body = await response.json();
  expect(body).toMatchObject({ status, code, traceId: expect.stringMatching(/^[0-9a-f]{32}$/) });
  expect(body.requestId).toBe(requestId);
  expect(JSON.stringify(body)).not.toContain("secret");
});

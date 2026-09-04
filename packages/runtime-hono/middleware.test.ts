import { expect, test } from "bun:test";
import { invokeFunction, type InvocationTarget } from "@relkit/engine";
import { z } from "@relkit/schema";
import { createApp, type RuntimeManifest } from "./src/index.js";
import type { HttpInvocationOptions } from "./src/materialize-routes.js";
import type { RegistrationPlan } from "@relkit/graph";
import { runtimeCohort } from "./test-cohort.ts";

const input = z.object({});
const output = z.object({ ok: z.literal(true) });
const source = { file: "src/app.ts", line: 1, column: 1 } as const;
const traceId = "10000000000000000000000000000001";

test("default middleware assigns IDs, forwards them to the engine, and records lifecycle", async () => {
  const events: string[] = [];
  const calls: HttpInvocationOptions[] = [];
  const app = createApp({
    plan: plan(),
    manifest: manifest(),
    middleware: {
      requestId: () => "request.fixed",
      traceId: () => traceId,
      onLifecycleEvent: (event) => events.push(event.type),
    },
    mapInput: () => ({}),
    engine: {
      invoke: async (options) => {
        calls.push(options);
        return { ok: true };
      },
    },
  });

  const response = await app.request("http://localhost/hello", { method: "POST" });
  await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get("x-request-id")).toBe("request.fixed");
  expect(response.headers.has("x-trace-id")).toBe(false);
  expect(events).toEqual(["request.started", "request.completed"]);
  expect(calls[0]).toMatchObject({
    requestId: "request.fixed",
    traceId,
    source: "http",
  });
});

test("invalid incoming IDs are replaced and a body limit short-circuits the route", async () => {
  let calls = 0;
  const events: string[] = [];
  const app = createApp({
    plan: plan(),
    manifest: manifest(),
    middleware: {
      maxBodyBytes: 3,
      onLifecycleEvent: (event) => events.push(event.type),
    },
    mapInput: () => ({}),
    engine: { invoke: async () => ((calls += 1), { ok: true }) },
  });

  const response = await app.request("http://localhost/hello", {
    method: "POST",
    headers: { "content-length": "4", "x-request-id": "not valid" },
    body: "test",
  });

  expect(response.status).toBe(413);
  expect(response.headers.get("x-request-id")).toMatch(/^request-/);
  expect(response.headers.has("x-trace-id")).toBe(false);
  expect(calls).toBe(0);
  expect(events).toEqual(["request.started", "request.completed"]);
});

test("HTTP cancellation reaches the engine signal and emits one cancellation event", async () => {
  const events: string[] = [];
  const app = createApp({
    plan: plan(),
    manifest: manifest(),
    middleware: {
      timeoutMs: 5,
      onLifecycleEvent: (event) => events.push(event.type),
    },
    mapInput: () => ({}),
    engine: {
      invoke: ({ signal }) =>
        new Promise((resolve) => {
          signal?.addEventListener("abort", () => resolve({ ok: true }), { once: true });
        }),
    },
  });

  await (await app.request("http://localhost/hello", { method: "POST" })).text();

  expect(events).toEqual(["request.started", "request.cancelled"]);
});

test("the engine receives function input and the public context, never Hono context", async () => {
  let observedInput: unknown;
  let observedContext: {
    readonly invocation: { readonly correlationId?: string; readonly traceId: string };
  };
  const target: InvocationTarget = {
    id: "hello",
    input,
    output,
    handler: (value, context) => {
      observedInput = value;
      observedContext = context;
      return { ok: true };
    },
  };
  const app = createApp({
    plan: plan(),
    manifest: manifest(),
    middleware: { requestId: () => "request.fixed", traceId: () => traceId },
    mapInput: () => ({}),
    engine: {
      invoke: (options) =>
        invokeFunction(target, options.input, {
          ...(options.signal === undefined ? {} : { signal: options.signal }),
          ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
          ...(options.traceId === undefined ? {} : { traceId: options.traceId }),
        }),
    },
  });

  const response = await app.request("http://localhost/hello", { method: "POST" });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(observedInput).toEqual({});
  expect((observedContext as Record<string, unknown>).req).toBeUndefined();
  expect(observedContext?.invocation.correlationId).toBeUndefined();
  expect(observedContext?.invocation.traceId).toBe(traceId);
});

function plan(): RegistrationPlan {
  return {
    graphHash: "sha256:middleware",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "hello.route",
        source,
        triggerType: "http",
        targetFunctionId: "hello",
        config: {
          method: "POST",
          path: "/hello",
          request: { kind: "input" },
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
    ...runtimeCohort("sha256:middleware"),
    functions: {},
    middleware: {},
    requestTransforms: {},
  };
}

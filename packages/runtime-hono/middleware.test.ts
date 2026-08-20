import { expect, test } from "bun:test";
import { invokeFunction, type InvocationTarget } from "@zsys/engine";
import { z } from "@zsys/schema";
import { createApp, type RuntimeManifest } from "./src/index.js";
import type { HttpInvocationOptions } from "./src/materialize-routes.js";
import type { RegistrationPlan } from "@zsys/graph";

const input = z.object({});
const output = z.object({ ok: z.literal(true) });
const source = { file: "src/app.ts", line: 1, column: 1 } as const;

test("default middleware assigns IDs, forwards them to the engine, and records lifecycle", async () => {
  const events: string[] = [];
  const calls: HttpInvocationOptions[] = [];
  const app = createApp({
    plan: plan(),
    manifest: manifest(),
    middleware: {
      requestId: () => "request.fixed",
      traceId: () => "trace.fixed",
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

  expect(response.status).toBe(200);
  expect(response.headers.get("x-request-id")).toBe("request.fixed");
  expect(response.headers.get("x-trace-id")).toBe("trace.fixed");
  expect(events).toEqual(["request.started", "request.completed"]);
  expect(calls[0]).toMatchObject({
    requestId: "request.fixed",
    correlationId: "request.fixed",
    traceId: "trace.fixed",
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
  expect(response.headers.get("x-trace-id")).toMatch(/^trace-/);
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

  await app.request("http://localhost/hello", { method: "POST" });

  expect(events).toEqual(["request.started", "request.cancelled"]);
});

test("the engine receives function input and the public context, never Hono context", async () => {
  let observedInput: unknown;
  let observedContext: {
    readonly invocation: { readonly correlationId?: string; readonly traceId: string };
  };
  let observedRequest: { readonly url: string } | undefined;
  const target: InvocationTarget = {
    id: "hello",
    input,
    output,
    handler: (value, request, context) => {
      observedInput = value;
      observedRequest = request;
      observedContext = context;
      return { ok: true };
    },
  };
  const app = createApp({
    plan: plan(),
    manifest: manifest(),
    middleware: { requestId: () => "request.fixed", traceId: () => "trace.fixed" },
    mapInput: () => ({}),
    engine: {
      invoke: (options) =>
        invokeFunction(target, options.input, {
          ...(options.signal === undefined ? {} : { signal: options.signal }),
          ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
          ...(options.traceId === undefined ? {} : { traceId: options.traceId }),
          ...(options.request === undefined ? {} : { request: options.request }),
        }),
    },
  });

  const response = await app.request("http://localhost/hello", { method: "POST" });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(observedInput).toEqual({});
  expect(observedRequest?.url).toBe("http://localhost/hello");
  expect((observedContext as Record<string, unknown>).req).toBeUndefined();
  expect(observedContext?.invocation.correlationId).toBe("request.fixed");
  expect(observedContext?.invocation.traceId).toBe("trace.fixed");
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
  };
}

function manifest(): RuntimeManifest {
  return {
    contractVersion: 1,
    generatorVersion: 1,
    graphHash: "sha256:middleware",
    functions: {},
    middleware: {},
    requestTransforms: {},
  };
}

import { expect, test } from "vitest";
import { invokeFunction, type InvocationTarget } from "../../src/engine/index.js";
import { z } from "../../src/schema/index.js";
import { createApp, type RuntimeManifest } from "../../src/runtime-hono/index.js";
import type { HttpInvocationOptions } from "../../src/runtime-hono/materialize-routes.js";
import type { RegistrationPlan } from "../../src/graph/index.js";
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
      onLifecycleEvent: (event) => {
        events.push(event.type);
      },
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
      onLifecycleEvent: (event) => {
        events.push(event.type);
      },
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
      onLifecycleEvent: (event) => {
        events.push(event.type);
      },
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
  let observedContext!: {
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

test("the body limit applies to the bytes of a chunked body on a mounted Better Auth handler", async () => {
  const received: number[] = [];
  const authPlan = {
    ...plan(),
    services: [
      {
        kind: "service",
        id: "auth",
        source,
        functions: [],
        capability: {
          kind: "better-auth",
          basePath: "/api/auth",
          databaseServiceId: "",
          mount: true,
        },
      },
    ],
  } as unknown as RegistrationPlan;
  const app = createApp({
    plan: authPlan,
    manifest: {
      ...manifest(),
      services: {
        auth: {
          handler: async (request: Request) => {
            received.push((await request.arrayBuffer()).byteLength);
            return new Response("signed up");
          },
        },
      },
    } as RuntimeManifest,
    middleware: { maxBodyBytes: 1024 * 1024 },
    engine: { invoke: async () => ({ ok: true }) },
  });
  /** Streams `size` bytes without a Content-Length header. */
  const chunked = (size: number) => {
    let sent = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= size) return controller.close();
        const chunk = Math.min(64 * 1024, size - sent);
        sent += chunk;
        controller.enqueue(new Uint8Array(chunk).fill(97));
      },
    });
  };
  const signUp = (path: string, size: number) =>
    app.fetch(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: chunked(size),
        duplex: "half",
      } as RequestInit),
    );

  const oversized = await signUp("/api/auth/sign-up/email", 5 * 1024 * 1024);
  expect(oversized.status).toBe(413);
  expect(received).toEqual([]);
  expect((await signUp("/hello", 2 * 1024 * 1024)).status).toBe(413);

  const small = await signUp("/api/auth/sign-up/email", 10_000);
  expect(await small.text()).toBe("signed up");
  expect(received).toEqual([10_000]);
});

test("an oversize body answers 413 payload-too-large whether its length is declared or streamed", async () => {
  const app = createApp({
    plan: plan(),
    manifest: manifest(),
    middleware: { maxBodyBytes: 8 },
    mapInput: () => ({}),
    engine: { invoke: async () => ({ ok: true }) },
  });
  const declared = await app.request("http://localhost/hello", {
    method: "POST",
    headers: { "content-length": "16" },
    body: "x".repeat(16),
  });
  const streamed = await app.fetch(
    new Request("http://localhost/hello", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(16));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit),
  );
  for (const response of [declared, streamed]) {
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      type: "/errors/payload-too-large",
      status: 413,
      code: "payload-too-large",
    });
  }
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
    channels: [],
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

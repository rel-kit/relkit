import { describe, expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import { defineError, defineFunction } from "../../../packages/functions/src/index.ts";
import {
  invokeFunction,
  type InvocationCompletion,
  type InvocationTarget,
} from "../../../packages/engine/src/index.ts";
import {
  createRegistrationPlan,
  type ApplicationGraph,
  type HttpTriggerRegistration,
  type RegistrationPlan,
} from "../../../packages/graph/src/index.ts";
import {
  createApp,
  type FrameworkMiddlewareInput,
  type HttpInvocationOptions,
  type HttpMiddlewareOptions,
  type RequestMappingOptions,
  type ResponseMappingOptions,
  type RuntimeManifest,
} from "../../../packages/runtime-hono/src/index.ts";
import {
  createTestHttpClient,
  createTestObservability,
  type TestHttpClient,
  type TestObservability,
} from "../../../packages/testing/src/index.ts";
import { defineRoute, http } from "../../../packages/routes/src/index.ts";
import { normalizeCompilation } from "../../../packages/compiler/src/index.ts";
import { z } from "../../../packages/schema/src/index.ts";

const source = { file: "src/http.ts", line: 1, column: 1 } as const;

type Behavior = (input: unknown, invocation: HttpInvocationOptions) => unknown | Promise<unknown>;

interface HarnessOptions {
  readonly plan: RegistrationPlan;
  readonly handlers?: Readonly<Record<string, Behavior>>;
  readonly manifestMiddleware?: Readonly<Record<string, unknown>>;
  readonly transforms?: Readonly<Record<string, unknown>>;
  readonly responseMapping?: ResponseMappingOptions;
  readonly requestMapping?: RequestMappingOptions;
  readonly middleware?: HttpMiddlewareOptions;
  readonly frameworkMiddleware?: FrameworkMiddlewareInput;
  readonly observability?: TestObservability;
}

interface Harness {
  readonly client: TestHttpClient;
  readonly calls: HttpInvocationOptions[];
  readonly observability: TestObservability;
  readonly close: () => Promise<void>;
}

interface RouteOptions {
  readonly method?: string;
  readonly path?: string;
  readonly targetFunctionId?: string;
  readonly request?: unknown;
  readonly responses?: readonly Record<string, unknown>[];
  readonly middleware?: readonly { readonly id: string; readonly targetFunctionId: string }[];
  readonly transforms?: readonly { readonly id: string; readonly schema: unknown }[];
  readonly timeoutMs?: number;
}

function route(id: string, options: RouteOptions = {}): HttpTriggerRegistration {
  return {
    kind: "trigger",
    id,
    source,
    triggerType: "http",
    targetFunctionId: options.targetFunctionId ?? id,
    config: {
      method: options.method ?? "GET",
      path: options.path ?? `/${id.replaceAll(".", "/")}`,
      request: options.request ?? { kind: "input", fields: {} },
      responses: options.responses ?? [],
      middleware: options.middleware ?? [],
      transforms: options.transforms ?? [],
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    },
  } as unknown as HttpTriggerRegistration;
}

function planFor(routes: readonly HttpTriggerRegistration[]): RegistrationPlan {
  return {
    graphHash: `sha256:${routes.map((item) => item.id).join(",")}`,
    functions: [],
    httpTriggers: routes,
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
  };
}

function orderedPlan(routes: readonly HttpTriggerRegistration[]): RegistrationPlan {
  const graph: ApplicationGraph = {
    contractVersion: 1,
    nodes: routes as unknown as ApplicationGraph["nodes"],
    edges: [],
  };
  return createRegistrationPlan(graph);
}

function success(id = "success", status = 200): Record<string, unknown> {
  return { kind: "success", id, status };
}

function validation(): Record<string, unknown> {
  return { kind: "validation-error", id: "validation.422", status: 422 };
}

function createHarness(options: HarnessOptions): Harness {
  const calls: HttpInvocationOptions[] = [];
  const observability = options.observability ?? createTestObservability();
  const manifest: RuntimeManifest = {
    contractVersion: 1,
    generatorVersion: 1,
    graphHash: options.plan.graphHash,
    functions: {},
    middleware: options.manifestMiddleware ?? {},
    requestTransforms: options.transforms ?? {},
  };
  const app = createApp({
    plan: options.plan,
    manifest,
    engine: {
      invoke: async (invocation) => {
        calls.push(invocation);
        const handler = options.handlers?.[invocation.functionId];
        if (handler === undefined) throw new Error(`Missing test handler ${invocation.functionId}`);
        return handler(invocation.input, invocation);
      },
    },
    ...(options.middleware === undefined ? {} : { middleware: options.middleware }),
    ...(options.frameworkMiddleware === undefined
      ? {}
      : { frameworkMiddleware: options.frameworkMiddleware }),
    ...(options.requestMapping === undefined ? {} : { requestMapping: options.requestMapping }),
    ...(options.responseMapping === undefined ? {} : { responseMapping: options.responseMapping }),
  });
  const client = createTestHttpClient(app);
  return { client, calls, observability, close: client.close };
}

function targetBehavior(target: InvocationTarget, observability: TestObservability): Behavior {
  return (input, invocation) =>
    invokeFunction(target, input, {
      source: "http",
      ...(invocation.signal === undefined ? {} : { signal: invocation.signal }),
      ...(invocation.traceId === undefined ? {} : { traceId: invocation.traceId }),
      ...(invocation.correlationId === undefined
        ? {}
        : { correlationId: invocation.correlationId }),
      ...(invocation.timeoutMs === undefined ? {} : { timeoutMs: invocation.timeoutMs }),
      hooks: { observability: observability.hooks },
    });
}

function createBarrier<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function within<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} exceeded ${String(timeoutMs)}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

describe("HTTP integration", () => {
  test("selects static, parameter, and wildcard routes in precedence order", async () => {
    const plan = orderedPlan([
      route("orders.wildcard", { path: "/orders/*", targetFunctionId: "wildcard" }),
      route("orders.parameter", { path: "/orders/:id", targetFunctionId: "parameter" }),
      route("orders.static", { path: "/orders/new", targetFunctionId: "static" }),
    ]);
    const harness = createHarness({
      plan,
      handlers: {
        static: () => ({ route: "static" }),
        parameter: () => ({ route: "parameter" }),
        wildcard: () => ({ route: "wildcard" }),
      },
    });
    try {
      expect(plan.httpTriggers.map(({ id }) => id)).toEqual([
        "orders.static",
        "orders.parameter",
        "orders.wildcard",
      ]);
      expect(await (await harness.client.get("/orders/new")).json()).toEqual({ route: "static" });
      expect(await (await harness.client.get("/orders/123")).json()).toEqual({
        route: "parameter",
      });
      expect(await (await harness.client.get("/orders/a/b")).json()).toEqual({
        route: "wildcard",
      });
    } finally {
      await harness.close();
    }
  });

  test("maps path, query, header, cookie, JSON, whole-body, nested, default, optional, constant, and transform inputs", async () => {
    const mapped = route("orders.mapped", {
      method: "POST",
      path: "/orders/:id",
      targetFunctionId: "mapped",
      request: {
        kind: "input",
        fields: {
          id: { kind: "path", name: "id" },
          query: {
            kind: "nested",
            fields: {
              term: { kind: "query", name: "term" },
              limit: { kind: "default", value: { kind: "query", name: "limit" }, default: 20 },
              optional: { kind: "optional", value: { kind: "query", name: "missing" } },
              normalized: {
                kind: "transform",
                transformId: "trim",
                value: { kind: "query", name: "term" },
              },
            },
          },
          token: { kind: "header", name: "x-api-key" },
          session: { kind: "cookie", name: "session" },
          sku: { kind: "body", name: "sku" },
          payload: { kind: "whole-body" },
          fixed: { kind: "constant", value: "fixed" },
        },
      },
      responses: [success()],
      transforms: [{ id: "trim", schema: {} }],
    });
    const upload = route("uploads.create", {
      method: "POST",
      path: "/uploads",
      targetFunctionId: "upload",
      request: { kind: "input", fields: { file: { kind: "multipart", name: "file" } } },
      responses: [success()],
    });
    const harness = createHarness({
      plan: planFor([mapped, upload]),
      transforms: { trim: z.string().transform((value) => value.trim()) },
      handlers: {
        mapped: (input) => input,
        upload: (input) => input,
      },
    });
    try {
      const response = await harness.client.post("/orders/order-1?term=%20hello%20", {
        headers: {
          "content-type": "application/json",
          "x-api-key": "api-key",
          cookie: "session=session-1",
        },
        body: JSON.stringify({ sku: "sku-1", quantity: 2 }),
      });
      expect(response.status).toBe(200);
      expect(harness.calls[0]?.input).toEqual({
        id: "order-1",
        query: { term: " hello ", limit: 20, optional: undefined, normalized: "hello" },
        token: "api-key",
        session: "session-1",
        sku: "sku-1",
        payload: { sku: "sku-1", quantity: 2 },
        fixed: "fixed",
      });

      const form = new FormData();
      form.append("file", "contents");
      const multipart = await harness.client.post("/uploads", { body: form });
      expect(multipart.status).toBe(200);
      expect(harness.calls[1]?.input).toEqual({ file: "contents" });
    } finally {
      await harness.close();
    }
  });

  for (const [name, init, issueCode] of [
    [
      "malformed JSON",
      { headers: { "content-type": "application/json" }, body: "{" },
      "malformed-json",
    ],
    [
      "wrong content type",
      { headers: { "content-type": "text/plain" }, body: "{}" },
      "content-type",
    ],
    [
      "body too large",
      { headers: { "content-type": "application/json" }, body: "12345" },
      "body-too-large",
    ],
  ] as const) {
    test(`rejects ${name} before engine invocation`, async () => {
      const harness = createHarness({
        plan: planFor([
          route("payload", {
            method: "POST",
            path: "/payload",
            request: { kind: "input", fields: { body: { kind: "whole-body" } } },
            responses: [validation()],
          }),
        ]),
        requestMapping: issueCode === "body-too-large" ? { maxBodyBytes: 3 } : undefined,
        handlers: { payload: () => ({ ok: true }) },
      });
      try {
        const response = await harness.client.post("/payload", init);
        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({
          error: "validation",
          issues: [{ code: issueCode }],
        });
        expect(harness.calls).toHaveLength(0);
      } finally {
        await harness.close();
      }
    });
  }

  test("rejects target schema failures before the handler runs", async () => {
    let handlerCalled = false;
    const target: InvocationTarget = {
      id: "schema",
      input: z.object({ id: z.literal("accepted") }),
      output: z.object({ ok: z.literal(true) }),
      handler: () => {
        handlerCalled = true;
        return { ok: true };
      },
    };
    const observed = createTestObservability();
    const harness = createHarness({
      plan: planFor([
        route("schema.route", {
          path: "/schema",
          targetFunctionId: "schema",
          request: { kind: "input", fields: { id: { kind: "query", name: "id" } } },
          responses: [validation(), success()],
        }),
      ]),
      observability: observed,
      handlers: { schema: targetBehavior(target, observed) },
    });
    try {
      const response = await harness.client.get("/schema?id=rejected");
      expect(response.status).toBe(500);
      expect(handlerCalled).toBe(false);
    } finally {
      await harness.close();
    }
  });

  test("maps declared errors, defects, and timeouts to safe responses", async () => {
    const missing = defineError({
      id: "orders.missing",
      data: z.object({ orderId: z.string() }),
      message: "Order not found",
      http: { status: 404 },
      retry: "never",
    });
    const declaredTarget: InvocationTarget = {
      id: "declared",
      input: z.object({}),
      output: z.object({ ok: z.literal(true) }),
      errors: [{ id: missing.id, data: missing.data }],
      handler: () => {
        throw missing.create({ orderId: "order-1" });
      },
    };
    const defectTarget: InvocationTarget = {
      id: "defect",
      input: z.object({}),
      output: z.object({ ok: z.literal(true) }),
      handler: () => {
        throw new Error("database-password");
      },
    };
    const timeoutTarget: InvocationTarget = {
      id: "timeout",
      input: z.object({}),
      output: z.object({ ok: z.literal(true) }),
      handler: (_input, _request, context) =>
        new Promise<never>((_resolve, reject) => {
          context.signal.addEventListener("abort", () => reject(context.signal.reason), {
            once: true,
          });
        }),
    };
    const observed = createTestObservability();
    const harness = createHarness({
      plan: planFor([
        route("declared.route", {
          path: "/declared",
          targetFunctionId: "declared",
          responses: [{ kind: "error", id: "missing.response", errorId: missing.id, status: 404 }],
        }),
        route("defect.route", { path: "/defect", targetFunctionId: "defect" }),
        route("timeout.route", {
          path: "/timeout",
          targetFunctionId: "timeout",
          timeoutMs: 15,
          responses: [{ kind: "response", id: "timeout", status: 504 }],
        }),
      ]),
      observability: observed,
      handlers: {
        declared: targetBehavior(declaredTarget, observed),
        defect: targetBehavior(defectTarget, observed),
        timeout: targetBehavior(timeoutTarget, observed),
      },
    });
    try {
      const declared = await harness.client.get("/declared");
      expect(declared.status).toBe(404);
      expect(await declared.json()).toMatchObject({
        outcome: "declared-error",
        code: missing.id,
        data: { orderId: "order-1" },
      });

      const defect = await harness.client.get("/defect");
      expect(defect.status).toBe(500);
      const defectBody = await defect.text();
      expect(defectBody).toBe(JSON.stringify({ error: "internal-error" }));
      expect(defectBody).not.toContain("database-password");

      const timeout = await harness.client.get("/timeout");
      expect(timeout.status).toBe(504);
      expect(await timeout.json()).toEqual({ error: "timeout" });
    } finally {
      await harness.close();
    }
  });

  test("runs framework middleware in order and continues through declared middleware", async () => {
    const order: string[] = [];
    const frameworkMiddleware = (["request-record", "limits", "trace", "request-id"] as const).map(
      (name) => ({
        name,
        handler: (async (_context, next) => {
          order.push(name);
          return next();
        }) as MiddlewareHandler,
      }),
    ) as FrameworkMiddlewareInput;
    const harness = createHarness({
      plan: planFor([
        route("middleware.route", {
          path: "/middleware",
          targetFunctionId: "main",
          responses: [success()],
          middleware: [{ id: "auth", targetFunctionId: "auth" }],
        }),
      ]),
      frameworkMiddleware,
      manifestMiddleware: {
        auth: {
          targetFunctionId: "auth",
          request: { kind: "input", fields: {} },
          decision: { kind: "continue" },
        },
      },
      handlers: {
        auth: () => ({ allowed: true }),
        main: () => ({ ok: true }),
      },
    });
    try {
      const response = await harness.client.get("/middleware");
      expect(response.status).toBe(200);
      expect(order).toEqual(["request-id", "trace", "limits", "request-record"]);
      expect(harness.calls.map(({ functionId }) => functionId)).toEqual(["auth", "main"]);
    } finally {
      await harness.close();
    }
  });

  test("honors a declared middleware short-circuit without invoking the route target", async () => {
    const harness = createHarness({
      plan: planFor([
        route("protected.route", {
          path: "/protected",
          targetFunctionId: "main",
          responses: [success("ok"), { kind: "response", id: "blocked", status: 401 }],
          middleware: [{ id: "auth", targetFunctionId: "auth" }],
        }),
      ]),
      manifestMiddleware: {
        auth: {
          targetFunctionId: "auth",
          request: { kind: "input", fields: {} },
          decision: { kind: "respond", responseId: "blocked" },
        },
      },
      handlers: { auth: () => ({ error: "unauthorized" }), main: () => ({ ok: true }) },
    });
    try {
      const response = await harness.client.get("/protected");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
      expect(harness.calls.map(({ functionId }) => functionId)).toEqual(["auth"]);
    } finally {
      await harness.close();
    }
  });

  test("propagates request IDs and records request lifecycle plus trace hooks", async () => {
    const lifecycle: string[] = [];
    const observed = createTestObservability();
    const target: InvocationTarget = {
      id: "hooks",
      input: z.object({}),
      output: z.object({ ok: z.literal(true) }),
      handler: () => ({ ok: true }),
    };
    const harness = createHarness({
      plan: planFor([route("hooks.route", { path: "/hooks", targetFunctionId: "hooks" })]),
      observability: observed,
      middleware: {
        requestId: () => "request.generated",
        traceId: () => "trace.generated",
        onLifecycleEvent: (event) => lifecycle.push(event.type),
      },
      handlers: { hooks: targetBehavior(target, observed) },
    });
    try {
      const response = await harness.client.get("/hooks", {
        headers: { "x-request-id": "request.incoming", "x-trace-id": "trace.incoming" },
      });
      expect(response.headers.get("x-request-id")).toBe("request.incoming");
      expect(response.headers.get("x-trace-id")).toBe("trace.incoming");
      expect(harness.calls[0]).toMatchObject({
        requestId: "request.incoming",
        correlationId: "request.incoming",
        traceId: "trace.incoming",
      });
      expect(lifecycle).toEqual(["request.started", "request.completed"]);
      expect(observed.types()).toEqual(
        expect.arrayContaining([
          "invocation.started",
          "span.started",
          "span.completed",
          "invocation.completed",
          "invocation.released",
        ]),
      );
      const completion = observed.read().find((event) => event.type === "invocation.completed");
      if (completion?.type === "invocation.completed")
        expect(completion.completion.record.traceId).toBe("trace.incoming");
    } finally {
      await harness.close();
    }
  });

  test("rejects invalid response bodies in test mode", async () => {
    const harness = createHarness({
      plan: planFor([
        route("response.route", {
          path: "/response",
          targetFunctionId: "response",
          responses: [success("result")],
        }),
      ]),
      responseMapping: { mode: "test", responseSchemas: { result: z.object({ ok: z.boolean() }) } },
      handlers: { response: () => ({ ok: "wrong" }) },
    });
    try {
      const response = await harness.client.get("/response");
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "internal-error" });
    } finally {
      await harness.close();
    }
  });

  test("rejects normalized route collisions before startup", () => {
    const target = defineFunction({
      id: "collision.target",
      input: z.object({ id: z.string() }),
      output: z.object({ ok: z.literal(true) }),
      handler: async () => ({ ok: true }),
    });
    const first = defineRoute({
      id: "collision.first",
      method: "GET",
      path: "/orders/:id",
      target,
      request: http.input({ id: http.path("id") }),
      responses: [http.success(200, target.output)],
    });
    const second = defineRoute({
      id: "collision.second",
      method: "GET",
      path: "/orders/:orderId",
      target,
      request: http.input({ id: http.path("orderId") }),
      responses: [http.success(200, target.output)],
    });

    const result = normalizeCompilation({ descriptors: [target, first, second] });
    expect(result.activatable).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ZSYS_ROUTE_COLLISION", severity: "error" }),
      ]),
    );
    expect(result.outputs.manifest).toBe("");
  });

  test("aborts ctx.signal and records a cancelled outcome when a real client disconnects", async () => {
    const started = createBarrier<void>();
    const aborted = createBarrier<void>();
    const completed = createBarrier<InvocationCompletion>();
    const lifecycle: string[] = [];
    const observed = createTestObservability();
    let contextSignal: AbortSignal | undefined;
    const target: InvocationTarget = {
      id: "disconnect",
      input: z.object({}),
      output: z.object({ ok: z.literal(true) }),
      handler: (_input, _request, context) => {
        contextSignal = context.signal;
        started.resolve();
        return new Promise<never>((_resolve, reject) => {
          const onAbort = (): void => {
            aborted.resolve();
            reject(context.signal.reason ?? new Error("client disconnected"));
          };
          if (context.signal.aborted) onAbort();
          else context.signal.addEventListener("abort", onAbort, { once: true });
        });
      },
    };
    const harness = createHarness({
      plan: planFor([
        route("disconnect.route", {
          path: "/disconnect",
          targetFunctionId: target.id,
          responses: [{ kind: "response", id: "cancelled", status: 499 }],
        }),
      ]),
      middleware: { onLifecycleEvent: (event) => lifecycle.push(event.type) },
      observability: observed,
      handlers: {
        [target.id]: (input, invocation) =>
          invokeFunction(target, input, {
            source: "http",
            ...(invocation.signal === undefined ? {} : { signal: invocation.signal }),
            hooks: {
              observability: observed.hooks,
              onCompletion: (event) => {
                if (event.outcome === "cancelled") completed.resolve(event);
              },
            },
          }),
      },
    });
    const listener = await harness.client.listen({ purpose: "disconnect", closeTimeoutMs: 1_000 });
    const client = new AbortController();
    const request = listener.request("/disconnect", { signal: client.signal }).then(
      () => ({ status: "fulfilled" as const }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
    try {
      await within(started.promise, 1_000, "handler start");
      expect(contextSignal?.aborted).toBe(false);

      client.abort();

      await within(aborted.promise, 1_000, "ctx.signal abortion");
      const completion = await within(completed.promise, 1_000, "cancelled invocation");
      const requestOutcome = await within(request, 1_000, "disconnected request");
      expect(requestOutcome.status).toBe("rejected");
      if (requestOutcome.status === "rejected")
        expect(requestOutcome.error).toMatchObject({ name: "AbortError" });
      expect(contextSignal?.aborted).toBe(true);
      expect(completion.outcome).toBe("cancelled");
      expect(lifecycle).toEqual(["request.started", "request.cancelled"]);
    } finally {
      await harness.close();
    }
  });
});

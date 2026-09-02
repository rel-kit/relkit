import { describe, expect, test } from "bun:test";
import {
  RELKIT_DESCRIPTOR,
  canonicalJson,
  createDescriptorBase,
  isDescriptor,
} from "../../packages/contracts/src/index.ts";
import { DeclaredError, defineError, defineFunction } from "../../packages/functions/src/index.ts";
import { defineBucket, isBucketDescriptor } from "../../packages/buckets/src/index.ts";
import { defineCache, isCacheDescriptor } from "../../packages/cache/src/index.ts";
import { defineAgent, isAgentDescriptor } from "../../packages/agents/src/index.ts";
import { defineEvent, isEventDescriptor } from "../../packages/events/src/index.ts";
import { defineJob } from "../../packages/jobs/src/index.ts";
import {
  defineMiddleware,
  defineRoute,
  defineTransform,
  http,
  isMiddlewareDescriptor,
} from "../../packages/routes/src/index.ts";
import {
  defineTool,
  isToolDescriptor,
  ToolApprovalRequiredError,
} from "../../packages/tools/src/index.ts";
import {
  defineService,
  isServiceDescriptor,
  isServiceRef,
} from "../../packages/services/src/index.ts";
import { defineEnv, env, isEnvRef } from "../../packages/config/src/index.ts";
import { CONVENTION_CODES, checkConventions } from "../../packages/compiler/src/index.ts";
import { defineApp } from "../../packages/app/src/index.ts";
import {
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
} from "../../packages/provider/src/index.ts";
import { getJsonSchema, z } from "../../packages/schema/src/index.ts";

const input = z.object({ id: z.string() });
const output = z.object({ ok: z.boolean() });
const errorData = z.object({ orderId: z.string() });

const notFound = defineError({
  id: "orders.not-found",
  data: errorData,
  message: ({ orderId }) => `Order ${orderId} was not found`,
  http: { status: 404 },
  retry: "never",
});

const lookup = defineFunction({
  id: "orders.lookup",
  input,
  output,
  errors: [notFound],
  handler: async (value) =>
    value.id === "missing" ? new notFound({ orderId: value.id }) : { ok: value.id.length > 0 },
});

const created = defineEvent({
  id: "orders.created",
  version: 1,
  input: z.object({ orderId: z.string() }),
  sensitiveFields: ["email"],
});

const changed = defineEvent({
  id: "orders.changed",
  version: 2,
  input: z.object({ orderId: z.string(), state: z.string() }),
});

describe.serial("Phase 2 descriptor cohort", () => {
  test("brands, freezes, and keeps explicit stable refs immutable", () => {
    const descriptor = defineFunction({
      id: " orders.create ",
      input,
      output,
      handler: async () => ({ ok: true }),
    });

    expect(descriptor[RELKIT_DESCRIPTOR]).toBe(true);
    expect(descriptor.id).toBe("orders.create");
    expect(descriptor.ref).toEqual({ kind: "function", id: "orders.create" });
    expect(isDescriptor(descriptor, "function")).toBe(true);
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.ref)).toBe(true);

    expect(() => {
      (descriptor as unknown as { id: string }).id = "changed";
    }).toThrow(TypeError);
    expect(() => {
      (descriptor.ref as unknown as { id: string }).id = "changed";
    }).toThrow(TypeError);
    expect(descriptor.id).toBe("orders.create");

    const base = createDescriptorBase("bucket", "assets", { tags: ["files"] });
    expect(Object.isFrozen(base.tags)).toBe(true);
    expect(() => {
      (base.tags as string[]).push("mutated");
    }).toThrow(TypeError);
  });

  test("narrows declared dependencies and creates typed declared errors", () => {
    const bucket = defineBucket({
      id: "orders.assets",
      visibility: "private",
      profile: "default",
    });
    const cache = defineCache({
      id: "orders.prices",
      key: z.object({ sku: z.string() }),
      value: z.object({ price: z.number() }),
      defaultTtlMs: 1_000,
      maxTtlMs: 10_000,
    });
    const job = defineJob({
      id: "orders.reconcile",
      input,
      target: lookup,
      retry: { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100, multiplier: 2, jitter: "none" },
    });
    const agentTool = defineTool({
      id: "orders.lookup-tool",
      target: lookup,
      description: "Look up an order",
      sideEffect: "read",
      approval: "never",
    });
    const agent = defineAgent({
      id: "orders.support",
      input: z.object({ prompt: z.string() }),
      output: z.object({ answer: z.string() }),
      model: "default",
      instructions: "Answer order questions",
      tools: [agentTool],
      limits: { maxSteps: 3, maxToolCalls: 2, timeoutMs: 1_000 },
    });

    const dependent = defineFunction({
      id: "orders.dependent",
      publishes: ["orders.created" as never],
      input,
      output,
      dependencies: {
        jobs: { reconcile: job },
        buckets: { assets: bucket },
        cache: { prices: cache },
        agents: { support: agent },
      },
      handler: async () => ({ ok: true }),
    });

    expect(Object.keys(dependent.dependencies ?? {}).sort()).toEqual([
      "agents",
      "buckets",
      "cache",
      "jobs",
    ]);

    const failure = notFound.create({ orderId: "order-1" });
    const constructed = new notFound({ orderId: "order-2" });
    expect(failure).toBeInstanceOf(DeclaredError);
    expect(constructed).toBeInstanceOf(notFound);
    expect(constructed).toBeInstanceOf(DeclaredError);
    expect(constructed.data).toEqual({ orderId: "order-2" });
    expect(failure.id).toBe("orders.not-found");
    expect(failure.ref).toEqual({ kind: "error", id: "orders.not-found" });
    expect(failure.data).toEqual({ orderId: "order-1" });
    expect(failure.message).toBe("Order order-1 was not found");
    expect(Object.isFrozen(failure.data)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(dependent, "handler")).toBe(true);
  });

  test("serializes route ASTs and named transform projections without closures", () => {
    const transform = defineTransform({ id: "orders.id", schema: z.string().uuid() });
    const projection = getJsonSchema(transform.schema);
    expect(projection.ok).toBe(true);
    if (projection.ok) expect(projection.schema.type).toBe("string");
    expect(transform.ref).toEqual({ kind: "transform", id: "orders.id" });

    const request = http.input({
      id: http.path("id"),
      query: http.nested({
        term: http.query("q"),
        limit: http.default(http.query("limit"), 20),
      }),
      auth: http.header("authorization", { optional: true }),
      session: http.cookie("session"),
      body: http.body("payload"),
      raw: http.wholeBody(),
      upload: http.multipart("file"),
      fixed: http.constant({ source: "test" }),
      transformed: http.transform(transform, http.path("id")),
    });
    const serialized = JSON.parse(canonicalJson(request)) as {
      kind: string;
      fields: Record<string, Record<string, unknown>>;
    };

    expect(serialized.kind).toBe("input");
    expect(serialized.fields.query).toEqual({
      kind: "nested",
      fields: {
        term: { kind: "query", name: "q" },
        limit: { kind: "default", value: { kind: "query", name: "limit" }, default: 20 },
      },
    });
    expect(serialized.fields.transformed).toEqual({
      kind: "transform",
      transformId: "orders.id",
      value: { kind: "path", name: "id" },
    });
    expect(JSON.stringify(serialized)).not.toContain("validate");

    const success = http.success(200, output);
    const middleware = defineMiddleware("/orders/*", async (_context, next) => next());
    const route = defineRoute({
      id: "orders.get",
      method: "GET",
      path: "/orders/:id",
      target: lookup,
      request,
      responses: [success, http.validationError()],
    });

    expect(isMiddlewareDescriptor(middleware)).toBe(true);
    expect(middleware.path).toBe("/orders/*");
    expect(Object.prototype.hasOwnProperty.call(middleware, "target")).toBe(false);
    expect(typeof middleware.handler).toBe("function");
    expect(Object.prototype.hasOwnProperty.call(route, "middleware")).toBe(false);
    expect(() =>
      defineTransform({ id: "bad.transform", schema: z.string(), handler: () => "bad" } as never),
    ).toThrow("cannot own handlers");
    expect(() => http.constant({ callback: (() => "bad") as unknown as string })).toThrow(
      "Invalid JSON value",
    );
  });

  test("keeps application environment and binding references value-free", () => {
    const definition = defineEnv({
      AWS_REGION: env.string().requiredIn("production"),
      API_KEY: env.secret().requiredIn("production").example("synthetic-secret"),
    });
    const cacheUrl = env.secret("CACHE_URL");
    const app = defineApp({
      env: definition,
      cache: defineProviderAdapter({
        integration: defineIntegrationReference("redis"),
        capability: defineProviderCapability("cache"),
        adapterId: "redis",
        connectionContract: defineConnectionContract({ url: { sensitive: true } }),
        connection: { url: cacheUrl },
        behavior: defineProviderBehavior({}),
      }),
    });

    expect(isEnvRef(definition.AWS_REGION)).toBe(true);
    expect(Object.keys(definition)).toEqual(["kind", "shape", "metadata"]);
    expect(Object.getOwnPropertyDescriptor(definition, "API_KEY")?.enumerable).toBe(false);
    expect(cacheUrl.kind).toBe("binding-value-ref");
    expect(JSON.stringify(app)).not.toContain("synthetic-secret");
    expect(JSON.stringify(app.cache)).toContain("CACHE_URL");
    expect(Object.isFrozen(app)).toBe(true);
    expect(Object.isFrozen(app.cache.profiles.default)).toBe(true);
  });

  test("validates job policies and omits executable handlers", () => {
    const job = defineJob({
      id: "orders.scheduled-reconcile",
      input,
      target: lookup,
      profile: "default",
      retry: {
        maxAttempts: 4,
        initialDelayMs: 100,
        maxDelayMs: 1_000,
        multiplier: 2,
        jitter: "full",
      },
      timeoutMs: 5_000,
      concurrency: 2,
      schedule: [
        {
          id: "hourly",
          cron: "0 * * * *",
          timezone: "UTC",
          input: { id: "scheduled" },
          overlap: "skip",
        },
      ],
      idempotency: { key: "id", retentionMs: 60_000 },
    });

    expect(job.profile).toBe("default");
    expect(job.schedule?.[0]?.input).toEqual({ id: "scheduled" });
    expect(job.idempotency).toEqual({ key: "id", retentionMs: 60_000 });
    expect(Object.prototype.hasOwnProperty.call(job, "handler")).toBe(false);
    expect(Object.isFrozen(job.retry)).toBe(true);
    expect(Object.isFrozen(job.schedule)).toBe(true);

    const invalid = (retry: Record<string, unknown>) =>
      defineJob({ id: "invalid.job", input, target: lookup, retry } as never);
    expect(() =>
      invalid({ maxAttempts: 0, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" }),
    ).toThrow();
    expect(() =>
      invalid({ maxAttempts: 1, initialDelayMs: 2, maxDelayMs: 1, multiplier: 1, jitter: "none" }),
    ).toThrow();
    expect(() =>
      invalid({ maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 1, multiplier: 0, jitter: "none" }),
    ).toThrow();
    expect(() =>
      invalid({ maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 1, multiplier: 1, jitter: "bad" }),
    ).toThrow();
  });

  test("keeps bucket/cache contracts logical and tools/agents handler-free", () => {
    const bucket = defineBucket({
      id: "orders.assets",
      visibility: "public",
      profile: "archive",
      maxObjectBytes: 10_000,
      allowedContentTypes: ["image/*", "application/json"],
    });
    const cache = defineCache({
      id: "orders.lookup-cache",
      profile: "default",
      key: z.object({ sku: z.string() }),
      value: z.object({ price: z.number() }),
      defaultTtlMs: 1_000,
      maxTtlMs: 2_000,
    });
    const tool = defineTool({
      id: "orders.lookup-tool",
      target: lookup,
      description: "Look up an order",
      sideEffect: "read",
      approval: "never",
      timeoutMs: 500,
    });
    const agent = defineAgent({
      id: "orders.support-agent",
      input: z.object({ prompt: z.string() }),
      output: z.object({ answer: z.string() }),
      model: "openai.default",
      instructions: { template: "Answer {{prompt}}", variables: ["prompt"] },
      tools: [tool],
      limits: { maxSteps: 5, maxToolCalls: 3, timeoutMs: 2_000 },
    });

    expect(isBucketDescriptor(bucket)).toBe(true);
    expect(bucket.allowedContentTypes).toEqual(["image/*", "application/json"]);
    expect(isCacheDescriptor(cache)).toBe(true);
    expect(getJsonSchema(cache.key).ok).toBe(true);
    expect(isToolDescriptor(tool)).toBe(true);
    expect(tool.target.ref).toEqual(lookup.ref);
    expect(tool.target.input).toBe(lookup.input);
    expect(tool.target.output).toBe(lookup.output);
    expect(tool.target.errors?.[0]).toBe(notFound);
    expect(Object.prototype.hasOwnProperty.call(tool, "handler")).toBe(false);
    expect(isAgentDescriptor(agent)).toBe(true);
    expect(agent.tools).toEqual([{ ref: { kind: "tool", id: "orders.lookup-tool" } }]);
    expect(agent.limits).toEqual({ maxSteps: 5, maxToolCalls: 3, timeoutMs: 2_000 });
    expect(Object.prototype.hasOwnProperty.call(agent, "handler")).toBe(false);
    expect(Object.isFrozen(agent.limits)).toBe(true);

    expect(() => defineTool({ ...({ target: {} } as never), id: "bad.tool" })).toThrow();
    expect(() =>
      defineAgent({
        id: "bad.agent",
        input: z.unknown(),
        output: z.unknown(),
        model: "default",
        instructions: "bad",
        tools: [tool],
        limits: { maxSteps: 0, maxToolCalls: 1, timeoutMs: 1 },
      }),
    ).toThrow();
  });

  test("keeps service members identity-preserving and cohesive", async () => {
    let calls = 0;
    const member = defineFunction({
      id: "orders.service-member",
      input,
      output,
      handler: async () => {
        calls += 1;
        return { ok: true };
      },
    });
    const service = defineService({
      id: "orders",
      functions: { get: member },
    });

    expect(isServiceDescriptor(service)).toBe(true);
    expect(isServiceRef(service)).toBe(true);
    expect(service.get).toBe(member);

    await expect(service.get.invoke({ id: "order-1" })).resolves.toEqual({ ok: true });
    const derivedTool = service.get.asTool({
      id: "orders.service-tool",
      description: "Read an order",
      sideEffect: "read",
      approval: "never",
    });
    await expect(derivedTool.invoke({ id: "order-1" })).resolves.toEqual({ ok: true });
    const directTool = defineTool({
      id: "orders.direct-tool",
      target: service.get,
      description: "Read an order directly",
      sideEffect: "read",
      approval: "never",
    });
    await expect(directTool.invoke({ id: "order-1" })).resolves.toEqual({ ok: true });
    expect(calls).toBe(3);

    const guardedTool = defineTool({
      id: "orders.guarded-tool",
      target: member,
      description: "Write an order",
      sideEffect: "write",
      approval: "on-write",
    });
    await expect(guardedTool.invoke({ id: "order-1" })).rejects.toBeInstanceOf(
      ToolApprovalRequiredError,
    );
    expect(calls).toBe(3);
  });

  test("rejects invalid declarations and keeps the public cohort immutable", () => {
    expect(() =>
      defineService({
        id: "orders.invalid-member",
        functions: { broken: {} },
      } as never),
    ).toThrow('Invalid service function member "broken"');
    expect(() =>
      defineService({
        id: "orders.reserved-member",
        functions: { functions: lookup },
      } as never),
    ).toThrow("reserved");
    expect(() =>
      defineService({
        id: "orders.colliding-members",
        functions: { " get ": lookup, get: lookup },
      } as never),
    ).toThrow("not normalized");
    expect(() => lookup.asTool()).toThrow("complete tool metadata");

    const service = defineService({ id: "orders.immutable", functions: { get: lookup } });
    const tool = service.get.asTool({
      description: "Read an order",
      sideEffect: "read",
      approval: "never",
    });
    expect(Object.isFrozen(service)).toBe(true);
    expect(Object.isFrozen(service.get)).toBe(true);
    expect(Object.isFrozen(tool)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(lookup, "invoke")).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    });
    expect(Object.getOwnPropertyDescriptor(lookup, "asTool")).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    });
    expect(Object.getOwnPropertyDescriptor(tool, "invoke")).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    });
    expect(() => {
      (service as unknown as { id: string }).id = "changed";
    }).toThrow(TypeError);
    expect(() => {
      (service as unknown as Record<string, unknown>).get = lookup;
    }).toThrow(TypeError);
    expect(service.id).toBe("orders.immutable");
  });

  test("emits every convention warning without excluding a descriptor", () => {
    const descriptor = createDescriptorBase("bucket", "Assets.Bucket");
    const diagnostics = checkConventions({
      descriptor,
      sourcePath: "src/misc/assets.ts",
      projectRoot: "/tmp/relkit-conventions",
      isDefaultExport: false,
      fileKinds: ["bucket", "function"],
      location: { line: 4, column: 2 },
    });

    expect(new Set(diagnostics.map(({ code }) => code))).toEqual(
      new Set(Object.values(CONVENTION_CODES)),
    );
    expect(diagnostics.every(({ severity }) => severity === "warning")).toBe(true);
    expect(diagnostics.every(({ descriptorId }) => descriptorId === "Assets.Bucket")).toBe(true);
    expect(
      diagnostics.every(
        ({ file, line, column }) => file === "src/misc/assets.ts" && line === 4 && column === 2,
      ),
    ).toBe(true);
    expect(isDescriptor(descriptor, "bucket")).toBe(true);

    const valid = createDescriptorBase("bucket", "assets");
    expect(
      checkConventions({
        descriptor: valid,
        sourcePath: "src/assets/buckets/assets.bucket.ts",
        isDefaultExport: true,
      }),
    ).toEqual([]);
    expect(
      checkConventions({ descriptor: valid, sourcePath: "src/shared/assets.ts" }).map(
        ({ code }) => code,
      ),
    ).toEqual([CONVENTION_CODES.directory, CONVENTION_CODES.suffix]);
  });
});

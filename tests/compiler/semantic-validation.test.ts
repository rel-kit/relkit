import { describe, expect, test } from "bun:test";
import { defineEvent, events, onEvent } from "../../packages/events/src/index.ts";
import { defineFunction } from "../../packages/functions/src/index.ts";
import {
  defineMiddleware,
  defineRoute,
  defineTransform,
  http,
} from "../../packages/routes/src/index.ts";
import { z, type StandardSchemaV1 } from "../../packages/schema/src/index.ts";
import { NORMALIZE_CODES, normalizeCompilation } from "../../packages/compiler/src/index.ts";

const input = z.object({ id: z.string() });
const output = z.object({ ok: z.boolean() });

function codes(result: ReturnType<typeof normalizeCompilation>): readonly string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

describe("compiler semantic validation", () => {
  test("indexes middleware and transforms without duplicating exported references", () => {
    const target = defineFunction({
      id: "orders.get",
      input,
      output,
      handler: async () => ({ ok: true }),
    });
    const transform = defineTransform({ id: "orders.id", schema: z.string() });
    const middleware = defineMiddleware({
      id: "orders.auth",
      target,
      request: http.input({ id: http.path("id") }),
      decision: http.continue(),
    });
    const route = defineRoute({
      id: "orders.route",
      method: "GET",
      path: "/orders/:id",
      target,
      request: http.input({ id: http.transform(transform, http.path("id")) }),
      responses: [http.success(200, output)],
      middleware: [middleware],
    });

    const result = normalizeCompilation({ descriptors: [target, transform, middleware, route] });

    expect(result.diagnostics).toEqual([]);
    expect(result.references.get("orders.auth")?.kind).toBe("middleware");
    expect(result.references.get("orders.id")?.kind).toBe("transform");
  });

  test("reports missing references, response incompatibility, and transform collisions", () => {
    const missing = normalizeCompilation({
      descriptors: [
        {
          kind: "route",
          id: "missing.route",
          target: { ref: { kind: "function", id: "missing.function" } },
          request: http.input({ id: http.transform("missing.transform", http.path("id")) }),
          responses: [http.success(200, output)],
          middleware: [{ ref: { kind: "middleware", id: "missing.middleware" } }],
        },
      ],
    });
    expect(codes(missing)).toEqual(
      expect.arrayContaining([
        NORMALIZE_CODES.missingTarget,
        NORMALIZE_CODES.missingMiddleware,
        NORMALIZE_CODES.missingTransform,
      ]),
    );

    const target = defineFunction({
      id: "orders.target",
      input,
      output,
      handler: async () => ({ ok: true }),
    });
    const badMiddleware = defineMiddleware({
      id: "orders.bad-auth",
      target,
      request: http.input({ other: http.path("other") }),
      decision: http.continue(),
    });
    const badRoute = defineRoute({
      id: "orders.bad-route",
      method: "GET",
      path: "/orders",
      target,
      request: http.input({ id: http.query("id") }),
      responses: [http.success(200, z.string())],
      middleware: [badMiddleware],
    });
    const incompatible = normalizeCompilation({ descriptors: [target, badMiddleware, badRoute] });
    expect(codes(incompatible)).toEqual(
      expect.arrayContaining([NORMALIZE_CODES.middlewareInput, NORMALIZE_CODES.response]),
    );

    const first = defineTransform({ id: "orders.same", schema: z.string() });
    const second = defineTransform({ id: "orders.same", schema: z.number() });
    expect(codes(normalizeCompilation({ descriptors: [first, second] }))).toContain(
      NORMALIZE_CODES.transformCollision,
    );
  });

  test("validates raw selectors, provider capabilities, and direct-call cycles", () => {
    const target = defineFunction({
      id: "events.target",
      input,
      output,
      handler: async () => ({ ok: true }),
    });
    const trigger = onEvent(events.all({ payload: "unknown" }), async () => ({ ok: true }), {
      id: "events.all",
      delivery: "ephemeral",
    });
    const app = {
      kind: "app",
      id: "app",
      ref: { kind: "app", id: "app" },
      providers: {
        development: { metadata: { profiles: { archive: ["buckets"] } } },
      },
    };
    const cache = {
      kind: "cache",
      id: "orders.cache",
      ref: { kind: "cache", id: "orders.cache" },
      profile: "archive",
      key: z.string(),
      value: z.string(),
    };
    const functionA = defineFunction({
      id: "cycle.a",
      input,
      output,
      dependencies: {
        functions: { b: { ref: { kind: "function", id: "cycle.b" }, input, output } },
      },
      handler: async () => ({ ok: true }),
    });
    const functionB = defineFunction({
      id: "cycle.b",
      input,
      output,
      dependencies: {
        functions: { a: { ref: { kind: "function", id: "cycle.a" }, input, output } },
      },
      handler: async () => ({ ok: true }),
    });

    const result = normalizeCompilation({
      descriptors: [app, cache, target, trigger, functionA, functionB],
    });
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        NORMALIZE_CODES.wildcard,
        NORMALIZE_CODES.providerProfile,
        NORMALIZE_CODES.cycle,
      ]),
    );
  });

  test("uses match expansion for typed envelopes and warns on restricted raw all", () => {
    const createdPayload = z.object({ orderId: z.string() });
    const updatedPayload = z.object({ orderId: z.string(), state: z.string() });
    const created = defineEvent({
      id: "orders.created",
      version: 1,
      payload: createdPayload,
    });
    const updated = defineEvent({
      id: "orders.updated",
      version: 2,
      payload: updatedPayload,
    });
    const envelope = <
      const Id extends string,
      const Version extends number,
      const Payload extends StandardSchemaV1,
    >(
      eventId: Id,
      version: Version,
      payload: Payload,
    ) =>
      z.object({
        instanceId: z.string(),
        eventId: z.literal(eventId),
        version: z.literal(version),
        payload,
        occurredAt: z.string(),
        publishedAt: z.string(),
        traceId: z.string(),
        attributes: z.object({}),
      });
    const typedTarget = defineFunction({
      id: "orders.typed-target",
      input: z.union([
        envelope("orders.created", 1, createdPayload),
        envelope("orders.updated", 2, updatedPayload),
      ]),
      output,
      handler: async () => ({ ok: true }),
    });
    const matchTrigger = onEvent(events.match("orders.*"), async () => ({ ok: true }), {
      id: "orders.match",
    });
    const anyTrigger = onEvent(
      events.anyOf("orders.updated" as never, "orders.created" as never),
      async () => ({ ok: true }),
      { id: "orders.any" },
    );
    const rawTarget = defineFunction({
      id: "orders.telemetry-target",
      input: z.object({
        instanceId: z.string(),
        eventId: z.string(),
        version: z.number(),
        payload: z.unknown(),
        occurredAt: z.string(),
        publishedAt: z.string(),
        traceId: z.string(),
        attributes: z.object({}),
      }),
      output,
      handler: async () => ({ ok: true }),
    });
    const rawTrigger = onEvent(
      events.all({ payload: "unknown", purpose: "telemetry" }),
      async () => ({ ok: true }),
      { id: "orders.telemetry", delivery: "ephemeral" },
    );
    const result = normalizeCompilation({
      descriptors: [created, updated, typedTarget, matchTrigger, anyTrigger, rawTarget, rawTrigger],
    });

    expect(codes(result)).not.toContain(NORMALIZE_CODES.eventTarget);
    expect(result.graph?.nodes.find((node) => node.id === "orders.match")).toMatchObject({
      config: { expansion: ["orders.created@1", "orders.updated@2"] },
    });
    expect(result.graph?.nodes.find((node) => node.id === "orders.any")).toMatchObject({
      config: { expansion: ["orders.created@1", "orders.updated@2"] },
    });
    expect(
      result.diagnostics.find((diagnostic) => diagnostic.code === NORMALIZE_CODES.wildcard),
    ).toMatchObject({
      code: NORMALIZE_CODES.wildcard,
      severity: "warning",
      message: "Raw all-event selector is restricted to telemetry.",
    });
  });
});

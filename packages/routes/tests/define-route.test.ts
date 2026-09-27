import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { defineFunction, streamOf } from "@relkit/functions";
import { z } from "@relkit/schema";
import { defineRoute, defineRouteEffect, http } from "../src/index.js";
import { RouteOperationError } from "../src/route-observability.js";

const target = defineFunction({
  id: "orders.get",
  input: z.object({ orderId: z.string() }),
  output: z.object({ ok: z.boolean() }),
  handler: async () => ({ ok: true }),
});

describe("defineRoute", () => {
  test("authors a route without transport metadata", () => {
    const route = defineRoute({ id: "orders.route", target });

    expect(route).toMatchObject({ id: "orders.route", target });
    expect(route).not.toHaveProperty("method");
    expect(route).not.toHaveProperty("path");
    expect(route).not.toHaveProperty("request");
    expect(route).not.toHaveProperty("responses");
  });

  test("retains explicit transport overrides and policies", () => {
    const store = {
      ref: { kind: "cache" as const, id: "rate-limits" },
      key: z.string(),
      value: z.number(),
    };
    const route = defineRoute({
      id: "orders.create",
      target,
      accept: "multipart/form-data",
      request: http.input({ orderId: http.header("x-order-id") }),
      responses: [http.success(201, target.output)],
      successStatus: 201,
      maxBodyBytes: 2_048,
      rateLimit: {
        limit: 10,
        windowMs: 60_000,
        key: http.header("x-api-key"),
        store,
      },
    });

    expect(route).toMatchObject({
      accept: "multipart/form-data",
      successStatus: 201,
      maxBodyBytes: 2_048,
      rateLimit: { limit: 10, windowMs: 60_000, store },
    });
    expect(Object.isFrozen(route.rateLimit)).toBe(true);
    expect(http.multipartAll("files")).toEqual({ kind: "multipart-all", name: "files" });
  });

  test("retains legacy transport fields for compiler migration diagnostics", () => {
    expect(
      defineRoute({ id: "legacy", target, method: "GET", path: "/orders" } as never),
    ).toMatchObject({ method: "GET", path: "/orders" });
  });

  test("rejects invalid policy options", () => {
    expect(() =>
      defineRoute({
        id: "bad-limit",
        target,
        rateLimit: { limit: 0, windowMs: 1, key: http.header("x-api-key") },
      }),
    ).toThrow("rateLimit.limit");
    expect(() => defineRoute({ id: "bad-status", target, successStatus: 404 })).toThrow(
      "successStatus",
    );
    expect(() => defineRoute({ id: "bad-accept", target, accept: "text/plain" as never })).toThrow(
      "Route accept",
    );
    expect(() =>
      defineRoute({
        id: "bad-store",
        target,
        rateLimit: {
          limit: 1,
          windowMs: 1,
          key: http.constant("all"),
          store: {
            ref: { kind: "cache", id: "bad-store" },
            key: z.string(),
            value: z.string(),
          },
        },
      }),
    ).toThrow("numeric values");
  });

  test("freezes client exposure and native stream policy", () => {
    expect(defineRoute({ id: "internal", target, client: false })).toMatchObject({
      client: false,
    });
    const streamed = defineFunction({
      id: "reports.stream",
      input: z.object({}),
      output: streamOf(z.string()),
      handler: async function* () {
        yield "ready";
      },
    });
    expect(
      defineRoute({ id: "reports.route", target: streamed, stream: { format: "sse" } }),
    ).toMatchObject({ stream: { format: "sse" } });
    expect(() => defineRoute({ id: "bad-stream", target, stream: { format: "sse" } })).toThrow(
      "requires streamOf",
    );
    expect(() => defineRoute({ id: "bad-client", target, client: {} })).not.toThrow();
    expect(() =>
      defineRoute({ id: "bad-client", target, client: { public: true } as never }),
    ).toThrow("Route client");
  });

  test("exposes the Effect path and typed validation failures", () => {
    const route = Effect.runSync(defineRouteEffect({ id: "effect.route", target }));
    expect(route.id).toBe("effect.route");
    const failure = Effect.runSync(
      Effect.flip(
        defineRouteEffect({
          id: "bad.target",
          target: {} as never,
        }),
      ),
    );
    expect(failure).toBeInstanceOf(RouteOperationError);
    expect(failure.operation).toBe("route.define");
    expect(() => defineRoute({ id: "bad.target", target: {} as never })).toThrow(
      "function reference",
    );
    expect(() => defineRoute(null as never)).toThrow("Route options must be an object");
  });

  test("validates explicit request and response mappings", () => {
    expect(() =>
      defineRoute({ id: "bad.request", target, request: http.path("id") as never }),
    ).toThrow("serializable HTTP input mapping");
    expect(() => defineRoute({ id: "empty.responses", target, responses: [] })).toThrow(
      "one response",
    );
    expect(() =>
      defineRoute({
        id: "duplicate.responses",
        target,
        responses: [http.success(200), http.success(200)],
      }),
    ).toThrow("Duplicate route response");
    expect(() =>
      defineRoute({
        id: "bad.responses",
        target,
        responses: [{ kind: "success", id: "bad", status: 700 }],
      }),
    ).toThrow("Invalid HTTP response");
  });

  test("defines a raw handler and attaches Better Auth registration", () => {
    const handler = async () => new Response("ok");
    const raw = defineRoute({ id: "raw.health", handler });
    expect(raw).toMatchObject({ raw: true, handler });
    expect(Object.isFrozen(raw)).toBe(true);
    expect(defineRoute({ handler }).id).toBeTruthy();
    expect(() => defineRoute({ id: "raw.bad", handler: undefined } as never)).toThrow(
      "require only a handler",
    );
    expect(() =>
      defineRoute({ id: "raw.bad-auth", handler, auth: { protected: ["/private"] } }),
    ).toThrow("Better Auth service handler");

    Object.defineProperty(handler, Symbol.for("relkit.better-auth.handler"), {
      value: { kind: "better-auth", service: { ref: { kind: "service", id: "auth.service" } } },
    });
    const authenticated = defineRoute({
      id: "raw.auth",
      handler,
      auth: { protected: ["/admin/*", "/admin/*"] },
    });
    expect(authenticated.auth).toMatchObject({
      kind: "better-auth",
      protected: ["/admin/*"],
      service: { ref: { id: "auth.service" } },
    });
  });
});

import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { defineFunction, streamOf } from "@relkit/functions";
import { z } from "@relkit/schema";
import { copyClient, copyClientEffect, copyStream, copyStreamEffect } from "../src/route-client.js";
import {
  copyProtectedPaths,
  copyProtectedPathsEffect,
  readBetterAuthRegistration,
  readBetterAuthRegistrationEffect,
} from "../src/route-auth.js";
import {
  copyRateLimit,
  copyRateLimitEffect,
  positive,
  positiveEffect,
  successStatus,
  successStatusEffect,
} from "../src/route-options.js";
import { RouteOperationError } from "../src/route-observability.js";
import { http } from "../src/http-dsl.js";

const output = z.object({ ok: z.boolean() });

describe("route authoring helpers", () => {
  test("copies client policies and reports tagged invalid input", () => {
    expect(Effect.runSync(copyClientEffect(false))).toBe(false);
    expect(copyClient(undefined)).toBeUndefined();
    expect(copyClient({ operation: "query" })).toEqual({ operation: "query" });
    expect(copyClient({})).toEqual({});
    expect(() => copyClient({ extra: true })).toThrow("Route client");
    const failure = Effect.runSync(Effect.flip(copyClientEffect({ operation: "read" })));
    expect(failure).toBeInstanceOf(RouteOperationError);
    expect(failure.operation).toBe("client.copy");
  });

  test("requires streamOf for native streaming", () => {
    expect(copyStream(undefined, output)).toBeUndefined();
    const stream = streamOf(z.string());
    expect(Effect.runSync(copyStreamEffect({ format: "sse" }, stream))).toEqual({ format: "sse" });
    expect(() => copyStream({ format: "text" }, output)).toThrow("requires streamOf");
    expect(() => copyStream({ format: "bad" }, stream)).toThrow("format");
    expect(() => copyStream({ format: "bytes", other: 1 }, stream)).toThrow("exactly one");
  });

  test("reads Better Auth registrations and normalizes protected paths", () => {
    const handler = () => new Response("ok");
    expect(readBetterAuthRegistration(handler)).toBeUndefined();
    Object.defineProperty(handler, Symbol.for("relkit.better-auth.handler"), {
      value: { kind: "better-auth", service: { ref: { kind: "service", id: "auth" } } },
    });
    expect(Effect.runSync(readBetterAuthRegistrationEffect(handler))).toMatchObject({
      service: { ref: { id: "auth" } },
    });
    expect(copyProtectedPaths(undefined)).toEqual([]);
    expect(Effect.runSync(copyProtectedPathsEffect(["/z/*", "/a", "/a"]))).toEqual(["/a", "/z/*"]);
    expect(Object.isFrozen(copyProtectedPaths(["/a"]))).toBe(true);
    expect(() => copyProtectedPaths(["a"])).toThrow("Invalid protected");
    expect(() => copyProtectedPaths(["/a?x"])).toThrow("Invalid protected");
    expect(() => copyProtectedPaths(["/a*b"])).toThrow("wildcard");
    expect(() => copyProtectedPaths(null as never)).toThrow("must be an array");
    expect(() => copyProtectedPaths([1] as never)).toThrow("Invalid protected route pattern");
  });

  test("validates numeric policies and copies a rate limit", () => {
    expect(positive(undefined, "timeoutMs")).toBeUndefined();
    expect(Effect.runSync(positiveEffect(1, "timeoutMs"))).toBe(1);
    expect(() => positive(0, "timeoutMs")).toThrow("positive integer");
    expect(() => positive(Number.MAX_SAFE_INTEGER + 1, "timeoutMs")).toThrow("positive integer");
    expect(successStatus(undefined)).toBeUndefined();
    expect(Effect.runSync(successStatusEffect(204))).toBe(204);
    expect(() => successStatus(300)).toThrow("successStatus");
    expect(copyRateLimit(undefined)).toBeUndefined();
    const key = http.header("x-api-key");
    const policy = Effect.runSync(copyRateLimitEffect({ limit: 5, windowMs: 1000, key }));
    expect(policy).toEqual({ limit: 5, windowMs: 1000, key });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(() => copyRateLimit({ limit: 0, windowMs: 1, key })).toThrow("rateLimit.limit");
    expect(() => copyRateLimit(null as never)).toThrow("must be an object");
    expect(() => copyRateLimit({ limit: 1, windowMs: 1, key: null } as never)).toThrow(
      "scalar request source",
    );
    expect(() => copyRateLimit({ limit: 1, windowMs: 1, key, store: {} } as never)).toThrow(
      "numeric values",
    );
    expect(() => copyRateLimit({ limit: 1, windowMs: 1, key: http.input({}) } as never)).toThrow(
      "scalar request source",
    );
  });

  test("accepts numeric cache stores and rejects other value schemas", () => {
    const target = defineFunction({
      id: "test.target",
      input: z.object({}),
      output,
      handler: async () => ({ ok: true }),
    });
    expect(target.ref.kind).toBe("function");
    const key = http.constant("all");
    const numericStore = {
      ref: { kind: "cache" as const, id: "numeric" },
      key: z.string(),
      value: z.number(),
    };
    expect(copyRateLimit({ limit: 1, windowMs: 10, key, store: numericStore })?.store).toBe(
      numericStore,
    );
    const stringStore = { ...numericStore, value: z.string() };
    expect(() => copyRateLimit({ limit: 1, windowMs: 10, key, store: stringStore })).toThrow(
      "numeric values",
    );
  });
});

import { describe, expect, test } from "bun:test";
import { defineFunction } from "@zsys/functions";
import { z } from "@zsys/schema";
import { defineRoute, http } from "./src/index.ts";

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
});

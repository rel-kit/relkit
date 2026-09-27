import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  defineMiddleware,
  defineMiddlewareEffect,
  isMiddlewareDescriptor,
  isMiddlewareDescriptorEffect,
  isMiddlewarePath,
  isMiddlewarePathEffect,
} from "../src/define-middleware.js";
import { RouteOperationError } from "../src/route-observability.js";

const handler = async () => new Response("ok");

describe("middleware authoring", () => {
  test("defines a frozen descriptor through Effect and the compatibility API", () => {
    const descriptor = Effect.runSync(defineMiddlewareEffect("/orders/:id/*", handler));
    expect(descriptor.path).toBe("/orders/:id/*");
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(isMiddlewareDescriptor(descriptor)).toBe(true);
    expect(Effect.runSync(isMiddlewareDescriptorEffect(descriptor))).toBe(true);
    expect(defineMiddleware("*", handler).path).toBe("*");
  });

  test("accepts only supported middleware path syntax", () => {
    for (const path of ["*", "/", "/orders", "/orders/:id", "/orders/*", "/a_b/xyz"])
      expect(Effect.runSync(isMiddlewarePathEffect(path))).toBe(true);
    for (const path of [
      null,
      "",
      "orders",
      "//",
      "/orders//x",
      "/orders/*/x",
      "/:9id",
      "/a?x",
      "/{x}",
    ])
      expect(isMiddlewarePath(path)).toBe(false);
    expect(() => defineMiddleware("orders", handler)).toThrow("Middleware path");
    expect(() => defineMiddleware("/orders", undefined as never)).toThrow(
      "handler must be a function",
    );
    const failure = Effect.runSync(Effect.flip(defineMiddlewareEffect("bad", handler)));
    expect(failure).toBeInstanceOf(RouteOperationError);
    expect(failure.operation).toBe("middleware.define");
  });

  test("rejects malformed middleware descriptors", () => {
    const descriptor = defineMiddleware("/orders", handler);
    expect(isMiddlewareDescriptor(null)).toBe(false);
    expect(isMiddlewareDescriptor({ ...descriptor, path: "bad" })).toBe(false);
    expect(isMiddlewareDescriptor({ ...descriptor, handler: undefined })).toBe(false);
  });
});

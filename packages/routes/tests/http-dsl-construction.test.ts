import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { z } from "@relkit/schema";
import {
  defineRequestTransform,
  defineRequestTransformEffect,
  defineTransform,
  defineTransformEffect,
  http,
  httpEffects,
  isTransformRef,
  isTransformRefEffect,
} from "../src/http-dsl.js";
import { RouteOperationError } from "../src/route-observability.js";

describe("HTTP mapping construction", () => {
  test("builds all scalar request sources through Effect", () => {
    const sources = [
      httpEffects.path("id"),
      httpEffects.pathSegments("parts"),
      httpEffects.query("page"),
      httpEffects.header("x-token"),
      httpEffects.cookie("session"),
      httpEffects.body("name"),
      httpEffects.multipart("photo"),
      httpEffects.multipartAll("files"),
    ];
    expect(sources.map((source) => Effect.runSync(source).kind)).toEqual([
      "path",
      "path-segments",
      "query",
      "header",
      "cookie",
      "body",
      "multipart",
      "multipart-all",
    ]);
    expect(http.body()).toEqual({ kind: "whole-body" });
    expect(Effect.runSync(httpEffects.wholeBody())).toEqual({ kind: "whole-body" });
    expect(http.path("id", { optional: true }).kind).toBe("optional");
    expect(http.query("page", { default: 1 }).kind).toBe("default");
    expect(http.pathSegments("parts", { optional: true }).kind).toBe("optional");
    expect(http.multipartAll("files", { default: [] }).kind).toBe("default");
    for (const source of [
      http.header("h", { optional: true }),
      http.cookie("c", { optional: true }),
      http.body("name", { optional: true }),
      http.multipart("photo", { optional: true }),
    ])
      expect(source.kind).toBe("optional");
    expect(() => http.path("")).toThrow("non-empty");
    const failure = Effect.runSync(Effect.flip(httpEffects.path("")));
    expect(failure).toBeInstanceOf(RouteOperationError);
  });

  test("constructs nested, optional, default, and constant mappings", () => {
    const id = Effect.runSync(httpEffects.path("id"));
    expect(Effect.runSync(httpEffects.input({ id }))).toEqual({ kind: "input", fields: { id } });
    expect(Effect.runSync(httpEffects.nested({ id }))).toEqual({ kind: "nested", fields: { id } });
    expect(Effect.runSync(httpEffects.constant({ mode: "all" }))).toEqual({
      kind: "constant",
      value: { mode: "all" },
    });
    expect(Effect.runSync(httpEffects.optional(id))).toEqual({ kind: "optional", value: id });
    expect(Effect.runSync(httpEffects.default(id, "none"))).toEqual({
      kind: "default",
      value: id,
      default: "none",
    });
    expect(Object.isFrozen(http.input({ id }))).toBe(true);
    expect(() => http.input({ bad: { kind: "unknown" } as never })).toThrow("serializable");
    expect(() => http.input({ "": id })).toThrow("non-empty");
    expect(() => http.input(null as never)).toThrow("fields must be an object");
    expect(() => http.input({ [Symbol("x")]: id } as never)).toThrow("fields must be an object");
    expect(() => http.constant((() => {}) as never)).toThrow();
  });

  test("constructs response and middleware decisions", () => {
    expect(Effect.runSync(httpEffects.success(201)).id).toBe("success.201");
    expect(Effect.runSync(httpEffects.error("not-found", 404)).errorId).toBe("not-found");
    expect(Effect.runSync(httpEffects.validationError()).status).toBe(422);
    expect(http.error("not-found", 404).status).toBe(404);
    expect(http.validationError(400).status).toBe(400);
    expect(Effect.runSync(httpEffects.response("custom", 207)).id).toBe("custom");
    expect(Effect.runSync(httpEffects.continue())).toEqual({ kind: "continue" });
    const respond = Effect.runSync(httpEffects.respond(http.success(200), http.constant("ok")));
    expect(respond).toMatchObject({ kind: "respond", responseId: "success.200" });
    expect(http.respond("custom")).toEqual({ kind: "respond", responseId: "custom" });
    expect(() => http.success(99)).toThrow("100 through 599");
    expect(() => http.response("bad", 700)).toThrow("100 through 599");
    expect(() => http.respond({ kind: "response", id: "bad", status: 700 })).toThrow(
      "Invalid HTTP response",
    );
  });

  test("defines serializable transforms and validates references", () => {
    const schema = z.string();
    const descriptor = Effect.runSync(
      defineTransformEffect({ id: "text.upper", schema, tags: ["text"] }),
    );
    expect(descriptor.ref.id).toBe("text.upper");
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(defineTransform({ id: "text.lower", schema }).id).toBe("text.lower");
    expect(defineRequestTransform({ id: "text.title", schema }).id).toBe("text.title");
    expect(Effect.runSync(defineRequestTransformEffect({ id: "text.trim", schema })).id).toBe(
      "text.trim",
    );
    const generated = defineTransform({ schema, title: "Text", description: "Text transform" });
    expect(generated.title).toBe("Text");
    expect(generated.description).toBe("Text transform");
    expect(isTransformRef(descriptor)).toBe(true);
    expect(
      Effect.runSync(isTransformRefEffect({ ref: { kind: "transform", id: "bad id" }, schema })),
    ).toBe(false);
    expect(http.transform(descriptor, http.body("text")).transformId).toBe("text.upper");
    expect(Effect.runSync(httpEffects.transform("text.upper")).value.kind).toBe("whole-body");
    expect(() =>
      http.transform({ ref: { kind: "transform", id: "bad id" }, schema } as never),
    ).toThrow("must be named");
    expect(() => defineTransform({ id: "bad", schema, handler: () => {} } as never)).toThrow(
      "cannot own handlers",
    );
    expect(() => defineTransform(null as never)).toThrow("options must be an object");
    expect(
      Effect.runSync(Effect.flip(defineTransformEffect({ id: "bad id", schema }))),
    ).toBeInstanceOf(RouteOperationError);
  });
});

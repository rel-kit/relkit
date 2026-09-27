import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { z } from "@relkit/schema";
import { http } from "../src/http-dsl.js";
import {
  assertMapping,
  assertMappingEffect,
  assertRequestMapping,
  assertRequestMappingEffect,
  assertResponse,
  assertResponseEffect,
  assertSchema,
  assertSchemaEffect,
  isHttpMapping,
  isHttpMappingEffect,
  isHttpRequestMapping,
  isHttpRequestMappingEffect,
  isHttpResponseMapping,
  isHttpResponseMappingEffect,
  isMiddlewareDecision,
  isMiddlewareDecisionEffect,
  isRecord,
  isRecordEffect,
  isSchema,
  isSchemaEffect,
  isStatus,
  isStatusEffect,
} from "../src/http-dsl-validation.js";
import { RouteOperationError } from "../src/route-observability.js";

describe("HTTP DSL validation", () => {
  test("recognizes each mapping node and rejects malformed graph nodes", () => {
    const nodes = [
      http.path("id"),
      http.pathSegments("parts"),
      http.query("q"),
      http.header("h"),
      http.cookie("c"),
      http.body("name"),
      http.wholeBody(),
      http.multipart("f"),
      http.multipartAll("fs"),
      http.constant(1),
      http.nested({ id: http.path("id") }),
      http.input({ id: http.path("id") }),
      http.optional(http.query("q")),
      http.default(http.query("q"), "all"),
      http.transform("name", http.body("value")),
    ];
    for (const node of nodes) expect(Effect.runSync(isHttpMappingEffect(node))).toBe(true);
    expect(nodes.every(isHttpMapping)).toBe(true);
    const invalid = [
      null,
      [],
      { kind: "missing" },
      { kind: "path", name: "" },
      { kind: "path", name: "id", extra: true },
      { kind: "whole-body", name: "x" },
      { kind: "constant", value: undefined },
      { kind: "input", fields: { x: { kind: "input", fields: {} } } },
      { kind: "optional", value: { kind: "input", fields: {} } },
      { kind: "default", value: http.path("id"), default: () => 1 },
      { kind: "transform", transformId: "bad id", value: http.path("id") },
    ];
    for (const node of invalid) expect(isHttpMapping(node)).toBe(false);
    expect(() => assertMapping(invalid[0])).toThrow("serializable");
    const failure = Effect.runSync(Effect.flip(assertMappingEffect(invalid[0])));
    expect(failure).toBeInstanceOf(RouteOperationError);
  });

  test("distinguishes request mappings, response mappings, and decisions", () => {
    const input = http.input({ id: http.path("id") });
    expect(Effect.runSync(isHttpRequestMappingEffect(input))).toBe(true);
    expect(isHttpRequestMapping(http.path("id"))).toBe(false);
    assertRequestMapping(input);
    expect(Effect.runSync(assertRequestMappingEffect(input))).toBeUndefined();
    expect(() => assertRequestMapping(http.path("id"))).toThrow("Route request");

    const response = http.success(200, z.object({ ok: z.boolean() }));
    expect(Effect.runSync(isHttpResponseMappingEffect(response))).toBe(true);
    expect(isHttpResponseMapping({ ...response, status: 700 })).toBe(false);
    expect(isHttpResponseMapping({ ...response, id: "bad id" })).toBe(false);
    expect(assertResponse(response)).toBe(response);
    expect(Effect.runSync(assertResponseEffect(response))).toBe(response);
    expect(() => assertResponse({ ...response, errorId: "bad id" })).toThrow(
      "Invalid HTTP response",
    );

    expect(Effect.runSync(isMiddlewareDecisionEffect(http.continue()))).toBe(true);
    expect(isMiddlewareDecision(http.respond(response))).toBe(true);
    expect(isMiddlewareDecision(http.respond(response, http.path("id")))).toBe(true);
    expect(isMiddlewareDecision({ kind: "respond", responseId: "bad id" })).toBe(false);
    expect(
      isMiddlewareDecision({ kind: "respond", responseId: "valid", body: { kind: "unknown" } }),
    ).toBe(false);
    expect(isMiddlewareDecision({ kind: "continue", extra: true })).toBe(false);
    expect(isMiddlewareDecision(null)).toBe(false);
    expect(isMiddlewareDecision({ kind: "unknown" })).toBe(false);
  });

  test("validates Standard Schema, status, and ordinary records", () => {
    const schema = z.string();
    expect(Effect.runSync(isSchemaEffect(schema))).toBe(true);
    expect(isSchema({ "~standard": { version: 2, validate: () => {} } })).toBe(false);
    expect(Effect.runSync(assertSchemaEffect(schema, "output"))).toBeUndefined();
    assertSchema(schema, "output");
    expect(() => assertSchema({}, "output")).toThrow("Standard Schema v1");
    expect(isStatus(100)).toBe(true);
    expect(Effect.runSync(isStatusEffect(599))).toBe(true);
    expect(isStatus(99)).toBe(false);
    expect(isStatus(600)).toBe(false);
    expect(isStatus(200.5)).toBe(false);
    expect(isRecord({})).toBe(true);
    expect(Effect.runSync(isRecordEffect([]))).toBe(false);
  });
});

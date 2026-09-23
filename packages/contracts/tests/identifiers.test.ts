import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  assertStableId,
  assertStableIdEffect,
  isProtocolId,
  isProtocolIdEffect,
  isStableId,
  normalizeId,
  normalizeIdEffect,
  normalizeProtocolId,
  normalizeProtocolIdEffect,
  StableIdError,
  SpanIdError,
  toEventInstanceId,
  toEventInstanceIdEffect,
  toGenerationId,
  toGenerationIdEffect,
  toGraphHash,
  toGraphHashEffect,
  toInvocationId,
  toInvocationIdEffect,
  toRequestId,
  toRequestIdEffect,
  toSpanId,
  toSpanIdEffect,
  toTraceId,
  toTraceIdEffect,
  TraceIdError,
} from "../src/index.js";

describe("stable and protocol identifiers", () => {
  test("normalizes valid explicit identifiers and rejects noncanonical assertions", () => {
    expect(normalizeProtocolId(" request-1 ")).toBe("request-1");
    expect(Effect.runSync(normalizeProtocolIdEffect("request-1"))).toBe("request-1");
    expect(isProtocolId("request-1")).toBe(true);
    expect(Effect.runSync(isProtocolIdEffect(" request-1 "))).toBe(false);
    expect(isStableId("request-1")).toBe(true);
    expect(() => assertStableId(" request-1 ")).toThrow(StableIdError);
    expect(Effect.runSync(Effect.flip(assertStableIdEffect("bad/id")))).toBeInstanceOf(
      StableIdError,
    );
    expect(() => assertStableId("request-1")).not.toThrow();
    expect(Effect.runSync(assertStableIdEffect("request-1"))).toBeUndefined();
    for (const invalid of [null, " "]) {
      expect(() => normalizeId(invalid)).toThrow(StableIdError);
      expect(Effect.runSync(Effect.flip(normalizeIdEffect(invalid)))).toBeInstanceOf(StableIdError);
    }
  });

  test.each([
    ["graph", toGraphHash, toGraphHashEffect],
    ["generation", toGenerationId, toGenerationIdEffect],
    ["request", toRequestId, toRequestIdEffect],
    ["invocation", toInvocationId, toInvocationIdEffect],
    ["event", toEventInstanceId, toEventInstanceIdEffect],
  ] as ReadonlyArray<
    readonly [
      string,
      (value: unknown) => string,
      (value: unknown) => Effect.Effect<string, StableIdError>,
    ]
  >)("converts %s IDs through sync and Effect APIs", (_, sync, effect) => {
    expect(sync(" id-1 ")).toBe("id-1");
    expect(Effect.runSync(effect("id-1"))).toBe("id-1");
    expect(() => sync("bad/id")).toThrow(StableIdError);
    expect(Effect.runSync(Effect.flip(effect("bad/id")))).toBeInstanceOf(StableIdError);
  });

  test("W3C identifiers require lowercase nonzero hex in both APIs", () => {
    const trace = "4bf92f3577b34da6a3ce929d0e0e4736";
    const span = "00f067aa0ba902b7";
    expect(toTraceId(trace)).toBe(trace);
    expect(Effect.runSync(toTraceIdEffect(trace))).toBe(trace);
    expect(toSpanId(span)).toBe(span);
    expect(Effect.runSync(toSpanIdEffect(span))).toBe(span);
    for (const invalid of ["0".repeat(32), trace.toUpperCase(), "short"]) {
      expect(() => toTraceId(invalid)).toThrow(TraceIdError);
      expect(Effect.runSync(Effect.flip(toTraceIdEffect(invalid)))).toBeInstanceOf(TraceIdError);
    }
    for (const invalid of ["0".repeat(16), span.toUpperCase(), "short"]) {
      expect(() => toSpanId(invalid)).toThrow(SpanIdError);
      const error = Effect.runSync(Effect.flip(toSpanIdEffect(invalid)));
      expect(error).toBeInstanceOf(SpanIdError);
      expect(error._tag).toBe("SpanIdError");
      expect(error.message).toBe("Invalid W3C span ID");
    }
  });
});

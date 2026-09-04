import { describe, expect, test } from "bun:test";
import {
  createSpanId,
  createTraceId,
  injectTraceContext,
  isSpanId,
  isTraceId,
  parseTraceParent,
  parseTracePropagation,
  parseTraceState,
  toTraceId,
} from "./src/index.js";

const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
const spanId = "00f067aa0ba902b7";
const parent = `00-${traceId}-${spanId}-01`;

describe("portable W3C tracing", () => {
  test("creates nonzero canonical IDs and rejects old identifier formats", () => {
    expect(isTraceId(createTraceId())).toBe(true);
    expect(isSpanId(createSpanId())).toBe(true);
    expect(() => toTraceId("trace-123")).toThrow();
    expect(isTraceId("0".repeat(32))).toBe(false);
    expect(isSpanId("0".repeat(16))).toBe(false);
  });

  test("parses and injects without local identity or unknown flag bits", () => {
    const parsed = parseTraceParent(parent.replace(/01$/, "03"), "vendor=state");
    expect(parsed).toEqual({
      traceId,
      spanId,
      traceFlags: 1,
      remote: true,
      traceState: "vendor=state",
    });
    const headers = new Headers({ tracestate: "old=state" });
    injectTraceContext(headers, parsed!);
    expect(headers.get("traceparent")).toBe(parent);
    expect(headers.get("tracestate")).toBe("vendor=state");
    expect(headers.has("x-request-id")).toBe(false);
    injectTraceContext(headers, { ...parsed!, traceState: "invalid" });
    expect(headers.has("tracestate")).toBe(false);
  });

  test("ignores invalid parents and accepts extensible future versions", () => {
    for (const invalid of [
      null,
      {},
      parent.toUpperCase(),
      `${parent}\n`,
      `${parent}-extra`,
      parent.replace(/^00/, "ff"),
      parent.replace(traceId, "0".repeat(32)),
      parent.replace(spanId, "0".repeat(16)),
      parent.slice(0, -1),
    ]) {
      expect(parseTraceParent(invalid)).toBeUndefined();
    }
    expect(parseTraceParent(parent.replace(/^00/, "01") + "-future")?.traceId).toBe(traceId);
    expect(parseTraceParent(parent, "broken")?.traceState).toBeUndefined();
  });

  test("validates bounded tracestate keys, values and duplicates", () => {
    expect(parseTraceState("tenant@vendor=state, other=value")).toBe(
      "tenant@vendor=state, other=value",
    );
    for (const value of [
      "",
      "a=",
      "a=1,a=2",
      "A=1",
      "a=x=y",
      "a=1\nb=2",
      "a=" + "x".repeat(257),
      Array.from({ length: 33 }, (_, n) => `a${n}=1`).join(","),
    ]) {
      expect(parseTraceState(value)).toBeUndefined();
    }
  });

  test("durable envelope contains causation only and tolerates malformed metadata", () => {
    const producer = parseTraceParent(parent)!;
    const parsed = parseTracePropagation({
      version: 2,
      producer,
      originRequestId: "request-1",
      correlationId: "business-1",
      signal: new AbortController().signal,
      deadlineMs: 1,
      payload: "private",
    });
    expect(parsed).toEqual({
      version: 2,
      producer,
      originRequestId: "request-1",
      correlationId: "business-1",
    });
    expect(Object.isFrozen(parsed?.producer)).toBe(true);
    for (const value of [
      null,
      {},
      { version: 1, producer },
      { version: 2, producer: {} },
      { version: 2, producer: { ...producer, traceFlags: NaN } },
      {
        get version() {
          throw new Error("metadata");
        },
      },
    ]) {
      expect(parseTracePropagation(value)).toBeUndefined();
    }
  });
});

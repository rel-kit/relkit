import { describe, expect, test } from "vitest";
import { Effect, Layer, Tracer } from "effect";
import { createSpanId, createTraceId } from "@relkit/contracts";
import {
  SpanRuntime,
  TraceContextReader,
  currentTracePropagation,
  currentTracePropagationEffect,
  runInExecutionContext,
  spanContext,
  spanContextEffect,
  startRootSpan,
} from "../src/index.js";

describe("trace propagation", () => {
  test("reads the live execution scope and preserves trace identity", () => {
    const runtime = new SpanRuntime({
      ids: { next: (kind) => kind === "trace" ? createTraceId() : createSpanId() },
    });
    const span = startRootSpan(runtime, "request", "server");
    expect(Effect.runSync(spanContextEffect(span))).toEqual(spanContext(span));
    const propagated = runInExecutionContext(
      { span, runtime, requestId: "request-1", invocationId: "invocation-1" },
      () => currentTracePropagation(),
    );
    expect(propagated).toMatchObject({
      version: 2,
      producer: { traceId: span.traceId, spanId: span.spanId, traceFlags: 1 },
      requestId: "request-1",
      invocationId: "invocation-1",
    });
    expect(currentTracePropagation()).toBeUndefined();
    runtime.close();
  });

  test("uses a deterministic reader Layer and rejects invalid IDs", () => {
    const runtime = new SpanRuntime({
      ids: { next: (kind) => kind === "trace" ? createTraceId() : createSpanId() },
    });
    const span = startRootSpan(runtime, "request", "server");
    const valid = Layer.succeed(TraceContextReader, {
      current: () => ({ span, runtime, correlationId: "correlation-1" }),
    });
    expect(
      Effect.runSync(Effect.provide(currentTracePropagationEffect(), valid)),
    ).toMatchObject({ correlationId: "correlation-1" });
    const invalid = Layer.succeed(TraceContextReader, {
      current: () => ({ span: Tracer.externalSpan({ traceId: "bad", spanId: "bad", sampled: true }), runtime }),
    });
    expect(Effect.runSync(Effect.provide(currentTracePropagationEffect(), invalid))).toBeUndefined();
    runtime.close();
  });
});

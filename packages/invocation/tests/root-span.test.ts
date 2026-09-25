import { describe, expect, test } from "vitest";
import { Context, Effect, Exit, Layer, Option, Tracer } from "effect";
import { TestClock } from "effect/testing";
import { createSpanId, createTraceId } from "@relkit/contracts";
import {
  InvocationTelemetry,
  SpanRuntime,
  completeSpan,
  completeSpanEffect,
  spanSnapshot,
  spanSnapshotEffect,
  startRootSpan,
  startRootSpanEffect,
} from "../src/index.js";
import type { InvocationOperation, SpanLifecycle } from "../src/index.js";

describe("root span and snapshots", () => {
  test("uses TestClock for root start and completion", async () => {
    const events: SpanLifecycle[] = [];
    const runtime = new SpanRuntime({
      ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
      observer: (event) => {
        events.push(event);
      },
    });
    const program = Effect.gen(function* () {
      const root = yield* startRootSpanEffect(runtime, "http.request", "server");
      root.attribute("relkit.request.id", "request-1");
      root.attribute("relkit.outcome", "success");
      yield* TestClock.adjust(25);
      yield* completeSpanEffect(root);
      return root;
    });
    const root = await Effect.runPromise(Effect.provide(program, TestClock.layer()));
    expect(root.status._tag).toBe("Ended");
    const snapshot = Effect.runSync(spanSnapshotEffect(events.at(-1)!));
    expect(snapshot).toMatchObject({
      name: "http.request",
      status: "completed",
      requestId: "request-1",
      outcome: "success",
      durationMs: 25,
    });
    expect(spanSnapshot(events.at(-1)!)).toEqual(snapshot);
    runtime.close();
  });

  test("preserves synchronous adapters and parent sampling", () => {
    const events: SpanLifecycle[] = [];
    const runtime = new SpanRuntime({
      ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
      observer: (event) => {
        events.push(event);
      },
    });
    const traceId = createTraceId();
    const parent = { traceId, spanId: createSpanId(), traceFlags: 0 };
    const span = startRootSpan(runtime, "consumer", "consumer", parent, traceId);
    expect(span.sampled).toBe(false);
    completeSpan(span, new Error("failed"));
    expect(events.at(-1)?.type).toBe("completed");
    runtime.close();
  });

  test("supports a telemetry Layer for span operations", () => {
    const seen: InvocationOperation[] = [];
    const layer = Layer.succeed(InvocationTelemetry, {
      observe: <A, E, R>(operation: InvocationOperation, effect: Effect.Effect<A, E, R>) => {
        seen.push(operation);
        return effect;
      },
    });
    const runtime = new SpanRuntime({
      ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
    });
    const root = Effect.runSync(
      Effect.provide(startRootSpanEffect(runtime, "root", "server"), layer),
    );
    Effect.runSync(Effect.provide(completeSpanEffect(root), layer));
    Effect.runSync(
      Effect.provide(
        spanSnapshotEffect({ type: "completed", span: root, revision: root.revision }),
        layer,
      ),
    );
    expect(seen).toEqual(["span.root-start", "span.complete", "span.snapshot"]);
    runtime.close();
  });

  test("serializes child metadata, captures, links, events, and errors", () => {
    const runtime = new SpanRuntime({
      ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
      capture: (value) => ({ bytes: 1, truncated: false, content: value as null }),
    });
    const parent = startRootSpan(runtime, "root", "server");
    const child = runtime.start({
      name: "child",
      parent: Option.some(parent),
      annotations: Context.empty(),
      links: [],
      startTime: 1_000_000n,
      kind: "internal",
      root: false,
      sampled: true,
    });
    for (const [key, value] of Object.entries({
      "relkit.origin_request.id": "origin-1",
      "relkit.invocation.id": "invocation-1",
      "relkit.function.id": "tasks.run",
      "relkit.service.id": "tasks",
      "relkit.correlation.id": "correlation-1",
      "relkit.invocation.source": "direct",
      "error.type": "Error",
      "error.message": "failed",
    }))
      child.attribute(key, value);
    child.capture("input", null);
    child.capture("output", null);
    child.event("attempt", 2_000_000n, { retry: true });
    const linked = Tracer.externalSpan({
      traceId: createTraceId(),
      spanId: createSpanId(),
      sampled: true,
    });
    child.addLinks([{ span: linked, attributes: { relation: "parent" } }]);
    child.end(3_000_000n, Exit.void);
    const snapshot = spanSnapshot({ type: "completed", span: child, revision: child.revision });
    expect(snapshot).toMatchObject({
      parentSpanId: parent.spanId,
      originRequestId: "origin-1",
      invocationId: "invocation-1",
      functionId: "tasks.run",
      serviceId: "tasks",
      correlationId: "correlation-1",
      source: "direct",
      error: { type: "Error", message: "failed" },
      durationMs: 2,
      inputCapture: { content: null },
      outputCapture: { content: null },
    });
    expect(snapshot.events?.[0]?.name).toBe("attempt");
    expect(snapshot.links?.[0]?.spanId).toBe(linked.spanId);
    runtime.close();
  });
});

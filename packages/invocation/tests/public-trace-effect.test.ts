import { describe, expect, test } from "vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { createSpanId, createTraceId } from "@relkit/contracts";
import {
  SpanRuntime,
  TraceOperationFailure,
  frameworkTrace,
  publicTrace,
  runInExecutionContext,
  runTraceSpanEffect,
  safeTraceAttributes,
  safeTraceAttributesEffect,
  startRootSpan,
  traceEventEffect,
  traceRenameEffect,
  traceSetAttributesEffect,
} from "../src/index.js";
import type { SpanLifecycle } from "../src/index.js";

describe("public trace Effect operations", () => {
  test("records child span events and attributes using TestClock", async () => {
    const events: SpanLifecycle[] = [];
    const runtime = new SpanRuntime({
      ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
      observer: (event) => {
        events.push(event);
      },
    });
    const root = startRootSpan(runtime, "request", "server");
    await runInExecutionContext({ span: root, runtime }, async () => {
      const program = Effect.gen(function* () {
        return yield* runTraceSpanEffect("child", { attributes: { cached: true } }, async () => {
          await Effect.runPromise(traceSetAttributesEffect({ ok: true }));
          await Effect.runPromise(traceEventEffect("cache.hit"));
          await Effect.runPromise(traceRenameEffect("renamed"));
          return 42;
        });
      });
      expect(await Effect.runPromise(Effect.provide(program, TestClock.layer()))).toBe(42);
    });
    const child = events.find(
      (event) => event.type === "completed" && event.span.name === "renamed",
    )?.span;
    expect(child?.attributes.get("cached")).toBe(true);
    expect(child?.attributes.get("ok")).toBe(true);
    expect(child?.events.map((event) => event.name)).toContain("cache.hit");
    runtime.close();
  });

  test("tags a callback failure and strips reserved public keys", async () => {
    const cause = new Error("callback failed");
    const failure = await Effect.runPromise(
      Effect.catchTag(
        runTraceSpanEffect("work", async () => {
          throw cause;
        }),
        "TraceOperationFailure",
        (error) => Effect.succeed(error),
      ),
    );
    expect(failure).toBeInstanceOf(TraceOperationFailure);
    expect(failure.cause).toBe(cause);
    const safe = Effect.runSync(
      safeTraceAttributesEffect(
        {
          "relkit.invocation.id": "forged",
          cached: true,
        },
        false,
      ),
    );
    expect(safe).toEqual({ cached: true });
  });

  test("ends an active child span when its Effect is interrupted", async () => {
    const events: SpanLifecycle[] = [];
    const runtime = new SpanRuntime({
      ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
      observer: (event) => {
        events.push(event);
      },
    });
    const root = startRootSpan(runtime, "request", "server");
    let started!: () => void;
    const callbackStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    await runInExecutionContext({ span: root, runtime }, async () => {
      const fiber = Effect.runFork(
        runTraceSpanEffect("interrupted", async () => {
          started();
          return new Promise<number>(() => undefined);
        }),
      );
      await callbackStarted;
      await Effect.runPromise(Fiber.interrupt(fiber));
    });
    expect(
      events.some((event) => event.type === "completed" && event.span.name === "interrupted"),
    ).toBe(true);
    runtime.close();
  });

  test("facades preserve public key filtering and framework span mutation", async () => {
    const runtime = new SpanRuntime({
      ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
    });
    const root = startRootSpan(runtime, "request", "server");
    await runInExecutionContext({ span: root, runtime }, async () => {
      publicTrace.event("public", { safe: true, "relkit.invocation.id": "forged" });
      frameworkTrace.event("internal", { "relkit.invocation.id": "real" });
      frameworkTrace.setAttributes({ "relkit.invocation.id": "real" });
      await frameworkTrace.span("child", async () => {
        frameworkTrace.rename("renamed");
        publicTrace.setAttributes({ child: true });
      });
    });
    expect(root.events[0]?.attributes).toEqual({ safe: true });
    expect(root.events[1]?.attributes["relkit.invocation.id"]).toBe("real");
    expect(root.attributes.get("relkit.invocation.id")).toBe("real");
    expect(safeTraceAttributes({ safe: true }, false)).toEqual({ safe: true });
    runtime.close();
  });
});

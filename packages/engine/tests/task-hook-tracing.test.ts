import { expect, it } from "@effect/vitest";
import { z } from "@relkit/schema";
import { Effect, Exit, Tracer } from "effect";
import { runConfiguredLifecycle, runTaskHook } from "../src/invoke-lifecycle.js";

/** Captures native hook spans and their ordering relative to callback execution.
 * @param events - Shared event sequence receiving span start and completion markers.
 * @returns A test tracer and the exact hook span objects it creates.
 */
function captureHooks(events: string[]) {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      if (span.name === "Engine.task.hook") {
        spans.push(span);
        events.push("span:start");
        const end = span.end.bind(span);
        span.end = (time, exit) => {
          events.push("span:end");
          end(time, exit);
        };
      }
      return span;
    },
  });
  return { spans, tracer };
}

/** Checks that each diagnostic hook ended successfully within the lifecycle span.
 * @param spans - Captured hook spans retaining their native parent and exit.
 * @param count - Expected number of configured hook executions.
 * @returns Nothing; failed expectations fail the owning test.
 */
function expectSuccessfulHooks(spans: Tracer.NativeSpan[], count: number) {
  expect(spans).toHaveLength(count);
  for (const span of spans) {
    expect(span.parent).toMatchObject({
      _tag: "Some",
      value: { name: "Engine.invocation.lifecycle" },
    });
    expect(span.status).toMatchObject({ _tag: "Ended", exit: { _tag: "Success" } });
  }
}

it.effect("does not create task hook spans for absent observers on success or failure", () =>
  Effect.gen(function* () {
    const capture = captureHooks([]);
    const context = { signal: new AbortController().signal };
    const target = { id: "hook.echo", input: z.number(), output: z.number(), handler: () => 7 };
    const options = { target, input: 1, context, onSignal: () => undefined };
    expect(yield* runConfiguredLifecycle(options).pipe(Effect.withTracer(capture.tracer))).toBe(7);
    const exit = yield* runConfiguredLifecycle({
      ...options,
      target: {
        ...target,
        handler: () => {
          throw new Error("handler failed");
        },
      },
    }).pipe(Effect.withTracer(capture.tracer), Effect.exit);
    expect(Exit.isFailure(exit)).toBe(true);
    yield* runTaskHook(undefined, "start", 1, context, undefined).pipe(
      Effect.withTracer(capture.tracer),
    );
    expect(capture.spans).toEqual([]);
  }),
);

it.effect("retains named hook spans, context and start-handler-success order", () =>
  Effect.gen(function* () {
    const events: string[] = [];
    const capture = captureHooks(events);
    const marker = {};
    const result = yield* runConfiguredLifecycle({
      target: {
        id: "hook.echo",
        input: z.number(),
        output: z.number(),
        handler: () => {
          events.push("handler");
          return 7;
        },
      },
      input: 1,
      context: { signal: new AbortController().signal, marker },
      onSignal: () => undefined,
      taskLifecycle: {
        onStart(value, context) {
          expect(value).toBe(1);
          expect(context.marker).toBe(marker);
          expect(context.signal.aborted).toBe(false);
          events.push("start");
        },
        onSuccess(value) {
          expect(value).toBe(7);
          events.push("success");
        },
      },
    }).pipe(Effect.withTracer(capture.tracer));
    expect(result).toBe(7);
    expect(events).toEqual([
      "span:start",
      "start",
      "span:end",
      "handler",
      "span:start",
      "success",
      "span:end",
    ]);
    expectSuccessfulHooks(capture.spans, 2);
  }),
);

it.effect("keeps failing observers diagnostic-only and preserves the handler failure cause", () =>
  Effect.gen(function* () {
    const events: string[] = [];
    const capture = captureHooks(events);
    const warnings: unknown[] = [];
    let observedCause: unknown;
    const exit = yield* runConfiguredLifecycle({
      target: {
        id: "hook.failure",
        input: z.number(),
        output: z.number(),
        handler: () => {
          events.push("handler");
          throw new Error("handler failed");
        },
      },
      input: 1,
      context: {
        signal: new AbortController().signal,
        log: {
          warn: (_message: string, details: unknown) => {
            warnings.push(details);
            throw new Error("logger failed");
          },
        },
      },
      onSignal: () => undefined,
      taskLifecycle: {
        onStart() {
          events.push("start");
          throw new Error("observer failed");
        },
        onFailure(cause) {
          observedCause = cause;
          events.push("failure");
          throw new Error("observer failed");
        },
      },
    }).pipe(Effect.withTracer(capture.tracer), Effect.exit);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(exit.cause).toEqual(observedCause);
    expect(events).toEqual([
      "span:start",
      "start",
      "span:end",
      "handler",
      "span:start",
      "failure",
      "span:end",
    ]);
    expect(warnings).toEqual([
      { hook: "start", reason: "error" },
      { hook: "failure", reason: "error" },
    ]);
    expectSuccessfulHooks(capture.spans, 2);
  }),
);

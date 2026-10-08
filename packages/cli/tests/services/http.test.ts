import { expect, it, vi } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber } from "effect";
import { CliHttp, httpLayer } from "../../src/services/http.service.js";

it.effect("interrupting header acquisition aborts the native fetch signal", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const response = Promise.withResolvers<Response>();
    let signal: AbortSignal | null | undefined;
    const spy = yield* Effect.acquireRelease(
      Effect.sync(() => vi.spyOn(globalThis, "fetch")),
      (spy) => Effect.sync(() => spy.mockRestore()),
    );
    spy.mockImplementation(async (_url, options) => {
      signal = options?.signal;
      Deferred.doneUnsafe(entered, Exit.succeed(undefined));
      return response.promise;
    });
    const http = yield* CliHttp;
    const requesting = yield* Effect.scoped(http.request("http://localhost/headers")).pipe(
      Effect.forkChild,
    );
    yield* Deferred.await(entered);
    requesting.interruptUnsafe();
    yield* Effect.yieldNow;
    const abortedBeforeHeaders = signal?.aborted;
    response.resolve(new Response(null));
    yield* Fiber.await(requesting);
    expect(abortedBeforeHeaders).toBe(true);
  }).pipe(Effect.provide(httpLayer)),
);

it.effect("rejects oversized declared bytes while releasing the body once", () =>
  Effect.gen(function* () {
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelled += 1;
      },
    });
    const http = yield* CliHttp;
    const result = yield* Effect.exit(
      http.text(new Response(body, { headers: { "content-length": "100" } }), 2),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result))
      expect(
        result.cause.reasons.some(
          (reason) => reason._tag === "Fail" && reason.error.operation === "http.limit",
        ),
      ).toBe(true);
    expect(cancelled).toBe(1);
    expect(body.locked).toBe(false);
  }).pipe(Effect.provide(httpLayer)),
);

it.effect("bounds streamed bytes before decoding and releases its reader", () =>
  Effect.gen(function* () {
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(new Uint8Array([65, 66, 67]));
      },
      cancel: () => {
        cancelled += 1;
      },
    });
    const http = yield* CliHttp;
    expect(Exit.isFailure(yield* Effect.exit(http.text(new Response(body), 2)))).toBe(true);
    expect(cancelled).toBe(1);
    expect(body.locked).toBe(false);
  }).pipe(Effect.provide(httpLayer)),
);

it.effect("interrupting a stalled body cancels the pending native read", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull: () => {
          Deferred.doneUnsafe(entered, Exit.succeed(undefined));
        },
        cancel: () => {
          cancelled += 1;
        },
      },
      { highWaterMark: 0 },
    );
    const http = yield* CliHttp;
    const reading = yield* http.text(new Response(body), 100).pipe(Effect.forkChild);
    yield* Deferred.await(entered);
    yield* Fiber.interrupt(reading);
    expect(cancelled).toBe(1);
    expect(body.locked).toBe(false);
  }).pipe(Effect.provide(httpLayer)),
);

import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Fiber, Layer, Stream } from "effect";
import { TestClock } from "effect/testing";
import { ClientAuthorization, ClientAuthorizationLive } from "../src/client-authorization.js";
import { RequestBodyReader, RequestBodyReaderLive } from "../src/request-body-service.js";
import { NativeStreams, NativeStreamsLive } from "../src/native-stream.js";
import { HttpSession, httpSessionLayer } from "../src/auth.js";
import { makeRateLimitWindow } from "../src/rate-limit-store.js";

it.effect("bounds fresh authorization with the injected clock", () =>
  Effect.gen(function* () {
    const authorization = yield* ClientAuthorization;
    const denied = yield* Effect.forkChild(
      authorization.require(() => new Promise<boolean>(() => undefined), "agent", 100),
    );
    yield* TestClock.adjust(100);
    const exit = yield* Fiber.await(denied);
    expect(Exit.isFailure(exit) && Cause.hasFails(exit.cause)).toBe(true);
    let checks = 0;
    yield* authorization.require(
      () => {
        checks++;
        return true;
      },
      "agent",
      100,
    );
    yield* authorization.require(
      () => {
        checks++;
        return true;
      },
      "agent",
      100,
    );
    expect(checks).toBe(2);
  }).pipe(Effect.provide(ClientAuthorizationLive)),
);

it.effect("releases an oversized body reader exactly once", () =>
  Effect.gen(function* () {
    let cancelled = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
      },
      cancel() {
        cancelled++;
      },
    });
    const request = new Request("http://fixture/body", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    const reader = yield* RequestBodyReader;
    expect(yield* reader.read(request, 2)).toMatchObject({ issue: { code: "body-too-large" } });
    expect(cancelled).toBe(1);
    expect(stream.locked).toBe(false);
  }).pipe(Effect.provide(RequestBodyReaderLive)),
);

it.effect("substitutes the body service without acquiring a native reader", () =>
  Effect.gen(function* () {
    const reader = yield* RequestBodyReader;
    expect(yield* reader.read(new Request("http://fixture/body"), 2)).toEqual({
      bytes: new Uint8Array([7]),
    });
  }).pipe(
    Effect.provide(
      Layer.succeed(RequestBodyReader, {
        read: () => Effect.succeed({ bytes: new Uint8Array([7]) }),
      }),
    ),
  ),
);

it.effect("returns a native iterator when downstream stops early", () =>
  Effect.gen(function* () {
    let finalized = 0;
    const source = (async function* () {
      try {
        yield "one";
        yield "two";
      } finally {
        finalized++;
      }
    })();
    const streams = yield* NativeStreams;
    const items = yield* streams.encode(source, "text").pipe(Stream.take(1), Stream.runCollect);
    expect(Array.from(items).map((bytes) => new TextDecoder().decode(bytes))).toEqual(["one"]);
    expect(finalized).toBe(1);
  }).pipe(Effect.provide(NativeStreamsLive)),
);

it.effect("shares the session lookup and explicitly refreshes it", () => {
  let calls = 0;
  return Effect.gen(function* () {
    const session = yield* HttpSession;
    expect(calls).toBe(0);
    expect(yield* Effect.all([session.get(false), session.get(false)], { concurrency: 2 })).toEqual(
      [1, 1],
    );
    expect(yield* session.get(true)).toBe(2);
    expect(yield* session.get(false)).toBe(2);
  }).pipe(Effect.provide(httpSessionLayer(new Headers(), async () => ++calls)));
});

it.effect("shares counter acquisition and preserves fixed-window TTL", () =>
  Effect.gen(function* () {
    let resolves = 0;
    const writes: { key: string; ttl: number | undefined }[] = [];
    const window = yield* makeRateLimitWindow(
      "route",
      "cache",
      100,
      () => {
        resolves++;
        return {
          get: () => undefined,
          increment: (key, _delta, options) => {
            writes.push({ key, ttl: options?.ttlMs });
            return 1;
          },
          delete: () => undefined,
        };
      },
      () => 125,
    );
    expect(resolves).toBe(0);
    yield* window.increment("private-user");
    yield* window.increment("private-user");
    expect(resolves).toBe(1);
    expect(writes.map(({ ttl }) => ttl)).toEqual([75, 75]);
    expect(writes[0]?.key).not.toContain("private-user");
  }),
);

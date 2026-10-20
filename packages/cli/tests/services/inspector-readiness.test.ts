/** Checks cold compilation, HTTP retry, deadlines and cancellation without wall-clock sleeps. */
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { cliAdapterError } from "../../src/cli-errors.js";
import { waitInspectorReady } from "../../src/commands/dev-inspector-support.service.js";
import type { HttpCapabilities } from "../../src/services/http.types.js";

function http(overrides: Partial<HttpCapabilities>): HttpCapabilities {
  return {
    request: () => Effect.succeed(new Response("Inspector")),
    text: () => Effect.succeed("Inspector"),
    json: () => Effect.die(new Error("Readiness must not parse application JSON")),
    ...overrides,
  };
}

it.effect("keeps a cold compiling Inspector alive beyond five seconds", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const client = http({
      request: () =>
        Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Effect.succeed(new Response("Inspector")).pipe(Effect.delay(6_000))),
        ),
    });
    const fiber = yield* waitInspectorReady(client, 3210).pipe(Effect.forkChild);
    yield* Deferred.await(entered);
    yield* TestClock.adjust(5_500);
    expect(fiber.pollUnsafe()).toBeUndefined();
    yield* TestClock.adjust(500);
    yield* Fiber.join(fiber);
  }),
);

it.effect("requires complete response bytes before advertising readiness", () =>
  Effect.gen(function* () {
    const reading = yield* Deferred.make<void>();
    const client = http({
      text: () =>
        Deferred.succeed(reading, undefined).pipe(
          Effect.andThen(Effect.succeed("Inspector").pipe(Effect.delay(8_000))),
        ),
    });
    const fiber = yield* waitInspectorReady(client, 3210).pipe(Effect.forkChild);
    yield* Deferred.await(reading);
    yield* TestClock.adjust(7_000);
    expect(fiber.pollUnsafe()).toBeUndefined();
    yield* TestClock.adjust(1_000);
    yield* Fiber.join(fiber);
  }),
);

it.effect("retries unavailable and non-success responses without claiming readiness", () =>
  Effect.gen(function* () {
    let attempts = 0;
    let reads = 0;
    const entered = yield* Deferred.make<void>();
    const client = http({
      request: () =>
        Effect.gen(function* () {
          attempts += 1;
          yield* Deferred.succeed(entered, undefined);
          if (attempts === 1) return yield* cliAdapterError("http.request", new Error("Refused"));
          return new Response("Inspector", { status: attempts === 2 ? 503 : 200 });
        }),
      text: () =>
        Effect.sync(() => {
          reads += 1;
          return "Inspector";
        }),
    });
    const fiber = yield* waitInspectorReady(client, 3210).pipe(Effect.forkChild);
    yield* Deferred.await(entered);
    yield* TestClock.adjust(100);
    yield* Fiber.join(fiber);
    expect(attempts).toBe(3);
    expect(reads).toBe(1);
  }),
);

it.effect("bounds startup at sixty seconds and releases the pending HTTP request", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    let released = false;
    const client = http({
      request: () =>
        Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(
            Effect.sync(() => {
              released = true;
            }),
          ),
        ),
    });
    const fiber = yield* waitInspectorReady(client, 3210).pipe(Effect.flip, Effect.forkChild);
    yield* Deferred.await(entered);
    yield* TestClock.adjust(59_999);
    expect(fiber.pollUnsafe()).toBeUndefined();
    yield* TestClock.adjust(1);
    const error = yield* Fiber.join(fiber);
    expect(error.operation).toBe("dev.inspector.readiness");
    expect(error.message).toContain("60 seconds");
    expect(released).toBe(true);
  }),
);

it.effect("cancels pending readiness and releases HTTP work immediately on shutdown", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    let released = false;
    const client = http({
      request: () =>
        Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(
            Effect.sync(() => {
              released = true;
            }),
          ),
        ),
    });
    const fiber = yield* waitInspectorReady(client, 3210).pipe(Effect.forkChild);
    yield* Deferred.await(entered);
    yield* Fiber.interrupt(fiber);
    expect(released).toBe(true);
  }),
);

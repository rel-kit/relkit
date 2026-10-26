/** Readiness retains cold compilation, complete response bytes, retry, deadlines and interruption. */
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { InspectionConnectionError } from "@relkit/inspector-api/connection";
import { waitInspectorUiReady } from "../src/ui-readiness.js";

it.effect("keeps a cold UI alive beyond five seconds and waits for its full response", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const probe = Deferred.succeed(entered, undefined).pipe(
      Effect.andThen(Effect.succeed(true).pipe(Effect.delay(8000))),
    );
    const fiber = yield* Effect.forkChild(waitInspectorUiReady(probe));
    yield* Deferred.await(entered);
    yield* TestClock.adjust(7500);
    expect(fiber.pollUnsafe()).toBeUndefined();
    yield* TestClock.adjust(500);
    yield* Fiber.join(fiber);
  }),
);

it.effect("retries connection failure and non-success without claiming readiness", () =>
  Effect.gen(function* () {
    let attempts = 0;
    const entered = yield* Deferred.make<void>();
    const probe = Effect.gen(function* () {
      attempts++;
      yield* Deferred.succeed(entered, undefined);
      if (attempts === 1)
        return yield* new InspectionConnectionError({
          operation: "fixture.refused",
          cause: new Error("Refused"),
        });
      return attempts >= 3;
    });
    const fiber = yield* Effect.forkChild(waitInspectorUiReady(probe));
    yield* Deferred.await(entered);
    yield* TestClock.adjust(100);
    yield* Fiber.join(fiber);
    expect(attempts).toBe(3);
  }),
);

it.effect("bounds startup at sixty seconds and releases a pending probe", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    let released = false;
    const probe = Deferred.succeed(entered, undefined).pipe(
      Effect.andThen(Effect.never),
      Effect.ensuring(
        Effect.sync(() => {
          released = true;
        }),
      ),
    );
    const fiber = yield* Effect.forkChild(Effect.flip(waitInspectorUiReady(probe)));
    yield* Deferred.await(entered);
    yield* TestClock.adjust(59_999);
    expect(fiber.pollUnsafe()).toBeUndefined();
    yield* TestClock.adjust(1);
    expect((yield* Fiber.join(fiber)).operation).toBe("ui.not-ready");
    expect(released).toBe(true);
  }),
);

it.effect("interruption releases pending HTTP work immediately", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    let released = false;
    const fiber = yield* Effect.forkChild(
      waitInspectorUiReady(
        Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(
            Effect.sync(() => {
              released = true;
            }),
          ),
        ),
      ),
    );
    yield* Deferred.await(entered);
    yield* Fiber.interrupt(fiber);
    expect(released).toBe(true);
  }),
);

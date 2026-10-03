import { it } from "@effect/vitest";
import { Context, Deferred, Effect, Fiber, References } from "effect";
import { expect, test } from "vitest";
import { currentNativeEffectContext, withNativeEffectContext } from "../src/native-context.js";

it.effect("native callbacks retain local configuration across asynchronous round trips", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const child = Effect.withFiber((fiber) =>
      Effect.promise(() =>
        withNativeEffectContext(fiber.context, async () => {
          const context = currentNativeEffectContext();
          expect(context).toBe(fiber.context);
          await Effect.runPromise(Deferred.succeed(entered, undefined));
          await Effect.runPromise(Deferred.await(release));
          expect(currentNativeEffectContext()).toBe(context);
          if (context === undefined) throw new Error("Missing native context");
          return Effect.runPromise(
            Effect.provide(Effect.service(References.MinimumLogLevel), context),
          );
        }),
      ),
    ).pipe(Effect.provideService(References.MinimumLogLevel, "Debug"));
    const fiber = yield* Effect.forkChild(child);
    yield* Deferred.await(entered);
    expect(
      Context.getOrUndefined(currentNativeEffectContext()!, References.MinimumLogLevel),
    ).toBeUndefined();
    expect(yield* References.MinimumLogLevel).toBe("Info");
    yield* Deferred.succeed(release, undefined);
    expect(yield* Fiber.join(fiber)).toBe("Debug");
    expect(yield* References.MinimumLogLevel).toBe("Info");
  }),
);

test("nested native contexts restore their parent after thrown failures", () => {
  const parent = Context.empty();
  const child = Context.add(parent, References.MinimumLogLevel, "Error");
  const failure = new TypeError("native validation");
  withNativeEffectContext(parent, () => {
    expect(currentNativeEffectContext()).toBe(parent);
    expect(() =>
      withNativeEffectContext(child, () => {
        expect(currentNativeEffectContext()).toBe(child);
        throw failure;
      }),
    ).toThrow(failure);
    expect(currentNativeEffectContext()).toBe(parent);
  });
  expect(currentNativeEffectContext()).toBeUndefined();
});

import { Deferred, Effect, Fiber, Layer, Ref, Result } from "effect";
import { expect, test } from "vitest";
import { AppConstantRunner } from "../src/context-resolution-service.js";
import { defineConstants } from "../src/context-descriptors.js";
import {
  ContextResolutionFailure,
  createApplicationContextResolver,
  createApplicationContextResolverEffect,
} from "../src/context-resolver.js";

const noop = (): void => undefined;
const log = { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
const signal = new AbortController().signal;

test("creates a resolver in Effect and reports duplicate registrations", () => {
  const resolver = Effect.runSync(createApplicationContextResolverEffect({ env: {} }));
  expect(typeof resolver.resolveEffect).toBe("function");
  const constants = defineConstants({ duplicate: 1 });
  const invalid = Effect.runSync(
    Effect.result(
      createApplicationContextResolverEffect({
        env: {},
        constants: { first: constants, second: constants },
      }),
    ),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(ContextResolutionFailure);
});

test("resolves dynamic constants with a replaceable service and ordered bounded concurrency", async () => {
  const entries = Object.fromEntries(
    Array.from({ length: 17 }, (_, index) => [`item${index}`, () => index]),
  );
  const resolver = createApplicationContextResolver({
    env: {},
    constants: { many: defineConstants(entries) },
  });
  const program = Effect.gen(function* () {
    const active = yield* Ref.make(0);
    const peak = yield* Ref.make(0);
    const started = yield* Ref.make(0);
    const allStarted = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const layer = Layer.succeed(
      AppConstantRunner,
      AppConstantRunner.of({
        run: (callback, options) =>
          Effect.gen(function* () {
            const count = yield* Ref.updateAndGet(active, (value) => value + 1);
            yield* Ref.update(peak, (value) => Math.max(value, count));
            if ((yield* Ref.updateAndGet(started, (value) => value + 1)) === 8)
              yield* Deferred.succeed(allStarted, undefined);
            yield* Deferred.await(release);
            const value = callback(options);
            yield* Ref.update(active, (current) => current - 1);
            return value;
          }),
      }),
    );
    const fiber = yield* Effect.forkChild(
      Effect.provide(resolver.resolveEffect({ signal, log }), layer),
    );
    yield* Deferred.await(allStarted);
    expect(yield* Ref.get(started)).toBe(8);
    yield* Deferred.succeed(release, undefined);
    const resolved = yield* Fiber.join(fiber);
    return { resolved, peak: yield* Ref.get(peak) };
  });
  const { resolved, peak } = await Effect.runPromise(program);
  expect(peak).toBe(8);
  expect(Object.values(resolved.constants)).toEqual(
    Array.from({ length: 17 }, (_, index) => index),
  );
});

test("retains callback failures in the typed channel and Promise adapter", async () => {
  const failure = new Error("resolver failed");
  const resolver = createApplicationContextResolver({
    env: {},
    constants: {
      dynamic: defineConstants({
        broken: () => {
          throw failure;
        },
      }),
    },
  });
  const result = await Effect.runPromise(
    Effect.result(
      resolver.resolveEffect({ signal, log }).pipe(
        Effect.provide(
          Layer.succeed(
            AppConstantRunner,
            AppConstantRunner.of({
              run: () =>
                Effect.fail(
                  new ContextResolutionFailure({ message: failure.message, cause: failure }),
                ),
            }),
          ),
        ),
      ),
    ),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("ContextResolutionFailure");
  await expect(resolver.resolve({ signal, log })).rejects.toBe(failure);
  const rejected = createApplicationContextResolver({
    env: {},
    constants: { dynamic: defineConstants({ broken: () => Promise.reject("string failure") }) },
  });
  await expect(rejected.resolve({ signal, log })).rejects.toBe("string failure");
});

test("a concurrent failure interrupts other dynamic lookups", async () => {
  const first = () => 1;
  const second = () => 2;
  const resolver = createApplicationContextResolver({
    env: {},
    constants: { dynamic: defineConstants({ first, second }) },
  });
  const program = Effect.gen(function* () {
    const firstStarted = yield* Deferred.make<void>();
    const firstReleased = yield* Ref.make(false);
    const layer = Layer.succeed(
      AppConstantRunner,
      AppConstantRunner.of({
        run: (callback) =>
          callback === first
            ? Effect.onExit(
                Effect.as(Deferred.succeed(firstStarted, undefined), 1).pipe(
                  Effect.andThen(Effect.never),
                ),
                () => Ref.set(firstReleased, true),
              )
            : Effect.andThen(
                Deferred.await(firstStarted),
                Effect.fail(
                  new ContextResolutionFailure({ message: "second failed", cause: "second" }),
                ),
              ),
      }),
    );
    const result = yield* Effect.result(
      Effect.provide(resolver.resolveEffect({ signal, log }), layer),
    );
    return { result, released: yield* Ref.get(firstReleased) };
  });
  const { result, released } = await Effect.runPromise(program);
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure.message).toBe("second failed");
  expect(released).toBe(true);
});

test("propagates cancellation to a running callback and prevents a late start", async () => {
  let started = 0;
  let received: AbortSignal | undefined;
  let notifyStart = (): void => undefined;
  const startedPromise = new Promise<void>((resolve) => {
    notifyStart = resolve;
  });
  const resolver = createApplicationContextResolver({
    env: {},
    constants: {
      dynamic: defineConstants({
        pending: ({ signal: callbackSignal }) => {
          started += 1;
          received = callbackSignal;
          notifyStart();
          return new Promise<never>(() => undefined);
        },
      }),
    },
  });
  const controller = new AbortController();
  controller.abort();
  await expect(resolver.resolve({ signal: controller.signal, log })).rejects.toThrow();
  expect(started).toBe(0);
  const noReasonSignal = new Proxy(controller.signal, {
    get: (target, property) =>
      property === "reason" ? undefined : Reflect.get(target, property, target),
  });
  await expect(resolver.resolve({ signal: noReasonSignal, log })).rejects.toMatchObject({
    name: "AbortError",
  });

  const running = new AbortController();
  const pending = resolver.resolve({ signal: running.signal, log });
  await startedPromise;
  expect(received).toBe(running.signal);
  const reason = new Error("caller cancelled");
  running.abort(reason);
  await expect(pending).rejects.toThrow();
  expect(started).toBe(1);
  expect(received?.aborted).toBe(true);
  expect(received?.reason).toBe(reason);
});

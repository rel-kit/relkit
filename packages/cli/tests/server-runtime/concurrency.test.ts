import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Layer, Queue, Ref } from "effect";
import { TestClock } from "effect/testing";
import {
  ServerRuntime,
  ServerRuntimeLive,
} from "../../src/server-runtime/server-runtime.service.js";
import { runtimeTestLayer } from "./runtime-test-layer.js";
import { ServerRuntimeFailure } from "../../src/server-runtime/server-runtime.schemas.js";

const layer = ServerRuntimeLive.pipe(Layer.provideMerge(runtimeTestLayer));

it.effect("preserves the first observed batch failure rather than input order", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const releaseFirst = yield* Deferred.make<void>();
    const observedSecond = yield* Deferred.make<void>();
    const first = new ServerRuntimeFailure({ operation: "first-input", cause: "later" });
    const second = new ServerRuntimeFailure({ operation: "second-input", cause: "earlier" });
    const batch = yield* runtime
      .each([0, 1], (index) =>
        index === 0
          ? Deferred.await(releaseFirst).pipe(Effect.andThen(Effect.fail(first)))
          : Effect.fail(second).pipe(
              Effect.onExit(() => Deferred.succeed(observedSecond, undefined)),
            ),
      )
      .pipe(Effect.forkChild);
    yield* Deferred.await(observedSecond);
    yield* Effect.yieldNow;
    yield* Deferred.succeed(releaseFirst, undefined);
    const result = yield* Fiber.await(batch);
    expect(
      Exit.isFailure(result) &&
        result.cause.reasons.some((reason) => reason._tag === "Fail" && reason.error === second),
    ).toBe(true);
    yield* runtime.shutdown(Effect.void);
    const calls = yield* Ref.make(0);
    expect(
      Exit.isFailure(
        yield* Effect.exit(runtime.each([1], () => Ref.update(calls, (value) => value + 1))),
      ),
    ).toBe(true);
    expect(yield* Ref.get(calls)).toBe(0);
  }).pipe(Effect.provide(layer)),
);

it.effect("bounds independent callbacks and awaits siblings before reporting failure", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const gate = yield* Deferred.make<void>();
    const started = yield* Queue.unbounded<number>();
    const active = yield* Ref.make(0);
    const peak = yield* Ref.make(0);
    const completed = yield* Ref.make(0);
    const primary = new ServerRuntimeFailure({ operation: "job-worker", cause: "first" });
    const batch = yield* runtime
      .each(
        Array.from({ length: 32 }, (_, index) => index),
        (index) =>
          Effect.gen(function* () {
            const count = yield* Ref.updateAndGet(active, (value) => value + 1);
            yield* Ref.update(peak, (value) => Math.max(value, count));
            yield* Queue.offer(started, index);
            yield* Deferred.await(gate);
            yield* Ref.update(active, (value) => value - 1);
            yield* Ref.update(completed, (value) => value + 1);
            if (index === 0) return yield* Effect.fail(primary);
          }),
      )
      .pipe(Effect.forkChild);
    yield* Effect.forEach(Array.from({ length: 16 }), () => Queue.take(started), { discard: true });
    expect(yield* Ref.get(peak)).toBe(16);
    expect(batch.pollUnsafe()).toBeUndefined();
    yield* Deferred.succeed(gate, undefined);
    const result = yield* Fiber.await(batch);
    expect(
      Exit.isFailure(result) &&
        result.cause.reasons.some((reason) => reason._tag === "Fail" && reason.error === primary),
    ).toBe(true);
    expect(yield* Ref.get(completed)).toBe(32);
    expect(yield* Ref.get(peak)).toBeLessThanOrEqual(16);
  }).pipe(Effect.provide(layer)),
);

it.effect("retains bounded repeated failure evidence and preserves the first primary", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const first = new ServerRuntimeFailure({ operation: "worker", cause: new Error("first") });
    yield* runtime.failure(first);
    yield* Effect.forEach(
      Array.from({ length: 100 }, (_, index) => index),
      (index) => runtime.failure(new ServerRuntimeFailure({ operation: "worker", cause: index })),
      { discard: true },
    );
    const failures = (yield* runtime.snapshot()).primaryFailures;
    expect(failures).toHaveLength(32);
    expect(failures[0]).toBe(first);
    expect(failures.at(-1)?.cause).toBe(99);
  }).pipe(Effect.provide(layer)),
);

it.effect("retains uncancellable completion after waiter interruption, then removes it", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const complete = yield* Deferred.make<void>();
    const task = yield* Effect.withFiber((fiber) =>
      Effect.sync(() => Effect.runPromiseWith(fiber.context)(Deferred.await(complete))),
    );
    const waiter = yield* runtime.track(task).pipe(Effect.forkChild);
    yield* Effect.yieldNow;
    yield* Fiber.interrupt(waiter);
    expect((yield* runtime.snapshot()).pendingInvocations).toBe(1);
    yield* Deferred.succeed(complete, undefined);
    yield* Effect.yieldNow;
    expect((yield* runtime.snapshot()).pendingInvocations).toBe(0);
  }).pipe(Effect.provide(layer)),
);

it.effect("drains physical work before releasing generation resources", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const complete = yield* Deferred.make<void>();
    const task = yield* Effect.withFiber((fiber) =>
      Effect.sync(() => Effect.runPromiseWith(fiber.context)(Deferred.await(complete))),
    );
    const waiter = yield* runtime.track(task).pipe(Effect.forkChild);
    yield* Effect.yieldNow;
    yield* Fiber.interrupt(waiter);
    const shutdown = yield* runtime.shutdown(Effect.void).pipe(Effect.forkChild);
    yield* Effect.yieldNow;
    expect(shutdown.pollUnsafe()).toBeUndefined();
    yield* Deferred.succeed(complete, undefined);
    const result = yield* Fiber.join(shutdown);
    expect(result.timedOut).toEqual([]);
  }).pipe(Effect.provide(layer)),
);

it.effect("retains drain timeout evidence for physically stalled work", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const complete = yield* Deferred.make<void>();
    const task = yield* Effect.withFiber((fiber) =>
      Effect.sync(() => Effect.runPromiseWith(fiber.context)(Deferred.await(complete))),
    );
    const waiter = yield* runtime.track(task).pipe(Effect.forkChild);
    yield* Effect.yieldNow;
    const shutdown = yield* runtime.shutdown(Effect.void).pipe(Effect.forkChild);
    yield* TestClock.adjust(10);
    expect((yield* Fiber.join(shutdown)).timedOut).toContain("invocations.drain");
    yield* Deferred.succeed(complete, undefined);
    yield* Fiber.join(waiter);
  }).pipe(Effect.provide(layer)),
);

it.effect("cancelled leader still completes shutdown for subsequent callers", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const entered = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const first = yield* runtime
      .shutdown(Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))))
      .pipe(Effect.forkChild);
    yield* Deferred.await(entered);
    const interruption = yield* Fiber.interrupt(first).pipe(Effect.forkChild);
    const subsequent = yield* runtime.shutdown(Effect.void).pipe(Effect.forkChild);
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(interruption);
    expect((yield* Fiber.join(subsequent)).stopping).toBe(true);
  }).pipe(Effect.provide(layer)),
);

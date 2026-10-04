import { expect, it } from "@effect/vitest";
import { Context, Deferred, Effect, Layer, ManagedRuntime } from "effect";
import { runExecutionPromise, runExecutionSync } from "../src/operation-runtime.js";
import type { CounterService } from "./operation-runtime-fixture.types.js";

/** Small substitutable service whose acquisition and release can be observed. */
class Counter extends Context.Service<Counter, CounterService>()("tests/Counter") {}

it.effect("reuses one synchronously acquired service and releases it once", () =>
  Effect.promise(async () => {
    let acquisitions = 0;
    let releases = 0;
    const live = Layer.effect(
      Counter,
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => acquisitions++),
          () =>
            Effect.sync(() => {
              releases++;
            }),
        );
        let count = 0;
        return Counter.of({ next: Effect.fn("Counter.next")(() => Effect.sync(() => ++count)) });
      }),
    );
    const owner = ManagedRuntime.make(live);
    try {
      const next = Effect.flatMap(Counter, (service) => service.next());
      expect(runExecutionSync(owner, next)).toBe(1);
      expect(runExecutionSync(owner, next)).toBe(2);
      expect(await runExecutionPromise(owner, next)).toBe(3);
      expect(acquisitions).toBe(1);
    } finally {
      await owner.dispose();
    }
    await owner.dispose();
    expect(releases).toBe(1);
  }),
);

it.effect("preserves original rejection and defect objects at compatibility edges", () =>
  Effect.promise(async () => {
    const owner = ManagedRuntime.make(Layer.empty);
    const rejection = { code: "existing-public-shape" };
    const defect = new Error("existing defect");
    try {
      let caught: unknown;
      try {
        runExecutionSync(owner, Effect.fail(rejection));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBe(rejection);
      await expect(runExecutionPromise(owner, Effect.fail(rejection))).rejects.toBe(rejection);
      await expect(runExecutionPromise(owner, Effect.die(defect))).rejects.toBe(defect);
    } finally {
      await owner.dispose();
    }
  }),
);

it.effect("a test Layer substitutes the same service contract at the sync edge", () =>
  Effect.promise(async () => {
    const testLayer = Layer.succeed(
      Counter,
      Counter.of({
        next: Effect.fn("Counter.testNext")(() => Effect.succeed(99)),
      }),
    );
    const owner = ManagedRuntime.make(testLayer);
    try {
      const next = Effect.flatMap(Counter, (service) => service.next());
      expect(runExecutionSync(owner, next)).toBe(99);
      expect(await runExecutionPromise(owner, next)).toBe(99);
    } finally {
      await owner.dispose();
    }
  }),
);

it.effect("owner disposal aborts native pending work without touching a caller controller", () =>
  Effect.gen(function* () {
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() => ManagedRuntime.make(Layer.empty)),
      (runtime) => Effect.promise(() => runtime.dispose()),
    );
    const started = yield* Deferred.make<void>();
    const caller = new AbortController();
    let nativeAborts = 0;
    const pending = Effect.gen(function* () {
      yield* Deferred.succeed(started, undefined);
      return yield* Effect.tryPromise({
        try: (signal) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                nativeAborts++;
                reject(signal.reason);
              },
              { once: true },
            );
          }),
        catch: (error) => error,
      });
    });
    // Observe the rejection immediately so disposal never creates an unhandled Promise.
    const result = runExecutionPromise(owner, pending, { signal: caller.signal }).then(
      () => "success",
      () => "interrupted",
    );
    yield* Deferred.await(started);
    yield* Effect.promise(() => owner.dispose());
    expect(yield* Effect.promise(() => result)).toBe("interrupted");
    expect(nativeAborts).toBe(1);
    expect(caller.signal.aborted).toBe(false);
  }).pipe(Effect.scoped),
);

it.effect("partial Layer acquisition releases successful earlier resources", () =>
  Effect.promise(async () => {
    let released = 0;
    const failed = Layer.effect(
      Counter,
      Effect.gen(function* () {
        yield* Effect.acquireRelease(Effect.void, () =>
          Effect.sync(() => {
            released++;
          }),
        );
        return yield* Effect.fail("later acquisition");
      }),
    );
    const owner = ManagedRuntime.make(failed);
    try {
      await expect(runExecutionPromise(owner, Counter)).rejects.toBe("later acquisition");
      expect(released).toBe(1);
    } finally {
      await owner.dispose();
    }
    expect(released).toBe(1);
  }),
);

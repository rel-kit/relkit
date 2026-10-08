import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Layer, Ref, Scope } from "effect";
import { TestClock } from "effect/testing";
import {
  ServerRuntime,
  ServerRuntimeLive,
} from "../../src/server-runtime/server-runtime.service.js";
import { ServerRuntimeFailure } from "../../src/server-runtime/server-runtime.schemas.js";
import { RuntimeEnvironmentTest, runtimeTestLayer } from "./runtime-test-layer.js";

const layer = ServerRuntimeLive.pipe(Layer.provideMerge(runtimeTestLayer));
const issue = (operation: string) =>
  new ServerRuntimeFailure({ operation, cause: new Error(operation) });

it.effect("publishes baseline before synchronously failing startup", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    expect((yield* runtime.snapshot()).ready.provider).toBe(false);
    const failed = yield* Effect.exit(
      runtime.resource("provider", Effect.fail(issue("provider")), () => Effect.void),
    );
    expect(Exit.isFailure(failed)).toBe(true);
    const state = yield* runtime.snapshot();
    expect(state.ready.provider).toBe(false);
    expect(state.primaryFailures).toHaveLength(1);
  }).pipe(Effect.provide(layer)),
);

it.effect("rolls back a handle acquired before materialization fails", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const released = yield* Ref.make(0);
    const acquire = Effect.acquireRelease(Effect.succeed("provider"), () =>
      Ref.update(released, (value) => value + 1),
    );
    const failed = yield* Effect.exit(
      runtime.resource("provider", acquire, () => Effect.fail(issue("materialize"))),
    );
    expect(Exit.isFailure(failed)).toBe(true);
    expect(yield* Ref.get(released)).toBe(1);
    yield* runtime.shutdown(Effect.void);
    expect(yield* Ref.get(released)).toBe(1);
  }).pipe(Effect.provide(layer)),
);

it.effect("retains primary failure alongside cleanup failure", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const primary = issue("materialize");
    const acquire = Effect.acquireRelease(Effect.succeed(1), () =>
      runtime.cleanup("provider.release", Effect.fail(issue("release"))),
    );
    const failed = yield* Effect.exit(
      runtime.resource("provider", acquire, () => Effect.fail(primary)),
    );
    expect(
      Exit.isFailure(failed) &&
        failed.cause.reasons.some((reason) => reason._tag === "Fail" && reason.error === primary),
    ).toBe(true);
    const state = yield* runtime.snapshot();
    expect(state.primaryFailures[0]).toBe(primary);
    expect(state.cleanupFailures[0]?.operation).toBe("provider.release");
  }).pipe(Effect.provide(layer)),
);

it.effect("shares one shutdown completion and releases once", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const released = yield* Ref.make(0);
    yield* runtime.resource(
      "provider",
      Effect.acquireRelease(Effect.succeed(1), () => Ref.update(released, (value) => value + 1)),
      () => Effect.void,
    );
    const first = yield* runtime.shutdown(Effect.void).pipe(Effect.forkChild);
    const second = yield* runtime.shutdown(Effect.void).pipe(Effect.forkChild);
    expect(yield* Fiber.join(first)).toEqual(yield* Fiber.join(second));
    expect(yield* Ref.get(released)).toBe(1);
  }).pipe(Effect.provide(layer)),
);

it.effect("rejects acquisition and loop admission after stopping", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    yield* runtime.shutdown(Effect.void);
    const calls = yield* Ref.make(0);
    const work = Ref.update(calls, (value) => value + 1);
    expect(
      Exit.isFailure(yield* Effect.exit(runtime.resource("late", work, () => Effect.void))),
    ).toBe(true);
    expect(Exit.isFailure(yield* Effect.exit(runtime.worker("late", work)))).toBe(true);
    expect(Exit.isFailure(yield* Effect.exit(runtime.retry("late", work)))).toBe(true);
    yield* runtime.setReady("provider", true);
    expect(yield* Ref.get(calls)).toBe(0);
    expect((yield* runtime.snapshot()).ready.provider).toBe(false);
  }).pipe(Effect.provide(layer)),
);

it.effect("interrupts retry backoff without another readiness attempt", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const attempted = yield* Deferred.make<void>();
    const calls = yield* Ref.make(0);
    const action = Effect.gen(function* () {
      yield* Ref.update(calls, (value) => value + 1);
      yield* Deferred.succeed(attempted, undefined);
      return yield* Effect.fail(issue("ready"));
    });
    const retry = yield* runtime.retry("ready", action).pipe(Effect.forkChild);
    yield* Deferred.await(attempted);
    yield* runtime.shutdown(Effect.void);
    yield* TestClock.adjust(10_000);
    expect(yield* Ref.get(calls)).toBe(1);
    expect(Exit.isFailure(yield* Fiber.await(retry))).toBe(true);
  }).pipe(Effect.provide(layer)),
);

it.effect("supervises defects without retrying a broken worker", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const environment = yield* RuntimeEnvironmentTest;
    const calls = yield* Ref.make(0);
    yield* runtime.worker(
      "worker",
      Ref.update(calls, (value) => value + 1).pipe(Effect.andThen(Effect.die("broken"))),
    );
    yield* TestClock.adjust(10);
    yield* Effect.yieldNow;
    expect((yield* environment.reports())[0]?.cause).toBe("broken");
    yield* TestClock.adjust(100);
    expect(yield* Ref.get(calls)).toBe(1);
  }).pipe(Effect.provide(layer)),
);

it.effect("polls at the existing interval without doubling the delay", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const calls = yield* Ref.make(0);
    yield* runtime.worker(
      "worker",
      Ref.update(calls, (value) => value + 1),
    );
    expect(yield* Ref.get(calls)).toBe(0);
    yield* TestClock.adjust(10);
    expect(yield* Ref.get(calls)).toBe(1);
    yield* TestClock.adjust(10);
    expect(yield* Ref.get(calls)).toBe(2);
    yield* runtime.shutdown(Effect.void);
    yield* TestClock.adjust(100);
    expect(yield* Ref.get(calls)).toBe(2);
  }).pipe(Effect.provide(layer)),
);

it.effect("readiness waits on one-shot publication and cannot revive shutdown", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const ready = yield* runtime.awaitReady("provider").pipe(Effect.forkChild);
    expect(ready.pollUnsafe()).toBeUndefined();
    yield* runtime.setReady("provider", true);
    yield* Fiber.join(ready);
    yield* runtime.shutdown(Effect.void);
    yield* runtime.setReady("server", true);
    expect((yield* runtime.snapshot()).ready.server).toBe(false);
  }).pipe(Effect.provide(layer)),
);

it.effect("bounds a deliberately stalled resource finalizer", () =>
  Effect.gen(function* () {
    const runtime = yield* ServerRuntime;
    const releasing = yield* Deferred.make<void>();
    yield* runtime.resource(
      "provider",
      Effect.acquireRelease(Effect.succeed(1), () =>
        runtime.cleanup(
          "provider.release",
          Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Effect.never)),
        ),
      ),
      () => Effect.void,
    );
    const shutdown = yield* runtime.shutdown(Effect.void).pipe(Effect.forkChild);
    yield* Deferred.await(releasing);
    yield* TestClock.adjust(10);
    const state = yield* Fiber.join(shutdown);
    expect(state.timedOut).toContain("provider.release");
    expect(state.cleanupFailures.length).toBeGreaterThan(0);
  }).pipe(Effect.provide(layer)),
);

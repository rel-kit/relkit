import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Cause, Context, Deferred, Effect, Exit, Fiber, ManagedRuntime, Ref } from "effect";
import { activateDrizzleService } from "../../src/activation.js";
import { defineDrizzleService, drizzleRuntimeOf } from "../../src/service.js";
import { DrizzleOwner, drizzleOwnerLayer, withDrizzleWork } from "../../src/owner.js";
import { DrizzleFailure, nativeCall } from "../../src/failure.js";
import { fakeLiveOwnerLayer, gate, records, testOwnerLayer } from "./fixtures.js";

for (const [name, layer] of [
  ["live", fakeLiveOwnerLayer],
  ["test", testOwnerLayer],
] as const) {
  it.effect(`substitutes the same ${name} owner contract`, () =>
    Effect.gen(function* () {
      const owner = yield* DrizzleOwner;
      expect(owner.client).toEqual({ test: true });
      expect(yield* Ref.get(owner.admission)).toEqual({ active: 0, closing: false });
      expect(owner.drained.isOpen()).toBe(true);
    }).pipe(Effect.provide(layer)),
  );
}

it.effect("close waits for admitted uncancellable work and refuses later lazy admission", () =>
  Effect.gen(function* () {
    const completed = gate<void>();
    const entered = yield* Deferred.make<void>();
    let disposed = 0;
    const active = yield* Effect.promise(() =>
      activateDrizzleService(
        defineDrizzleService({
          schema: { records },
          client: () => ({}),
          dispose: () => {
            disposed++;
          },
        }),
        {},
        { isolated: true },
      ),
    );
    const delayed = withDrizzleWork(
      active,
      Effect.andThen(
        Deferred.succeed(entered, undefined),
        nativeCall("test", () => completed.promise),
      ),
    );
    const fiber = yield* Effect.forkChild(delayed);
    yield* Deferred.await(entered);
    const closing = active.close();
    expect(active.close()).toBe(closing);
    expect(disposed).toBe(0);
    const late = yield* Effect.exit(withDrizzleWork(active, Effect.succeed("late")));
    expect(Exit.isFailure(late) && Cause.hasFails(late.cause)).toBe(true);
    completed.resolve(undefined);
    yield* Fiber.join(fiber);
    yield* Effect.promise(() => closing);
    expect(disposed).toBe(1);
  }),
);

it.effect("interruption waits for SDK completion before releasing admission", () =>
  Effect.gen(function* () {
    const completed = gate<void>();
    const entered = yield* Deferred.make<void>();
    let disposed = false;
    const active = yield* Effect.promise(() =>
      activateDrizzleService(
        defineDrizzleService({
          schema: { records },
          client: () => ({}),
          dispose: () => {
            disposed = true;
          },
        }),
        {},
        { isolated: true },
      ),
    );
    const work = yield* Effect.forkChild(
      withDrizzleWork(
        active,
        Effect.andThen(
          Deferred.succeed(entered, undefined),
          nativeCall("query", () => completed.promise),
        ),
      ),
    );
    yield* Deferred.await(entered);
    const interruption = yield* Effect.forkChild(Fiber.interrupt(work));
    const closing = active.close();
    expect(disposed).toBe(false);
    completed.resolve(undefined);
    yield* Fiber.join(interruption);
    yield* Effect.promise(() => closing);
    expect(disposed).toBe(true);
  }),
);

it.effect("individual acquisition waiter interruption leaves the owner's acquisition intact", () =>
  Effect.gen(function* () {
    const pending = gate<object>();
    const started = yield* Deferred.make<void>();
    let attempts = 0;
    const descriptor = defineDrizzleService({
      schema: { records },
      client: () => {
        attempts++;
        return pending.promise;
      },
    });
    const activation = activateDrizzleService(descriptor, {});
    const waiter = yield* Effect.forkChild(
      Effect.andThen(
        Deferred.succeed(started, undefined),
        Effect.promise(() => activation),
      ),
    );
    yield* Deferred.await(started);
    yield* Fiber.interrupt(waiter);
    pending.resolve({});
    const active = yield* Effect.promise(() => activateDrizzleService(descriptor, {}));
    expect(attempts).toBe(1);
    yield* Effect.promise(() => active.close());
  }),
);

it.effect("preserves caller services and defects through lazy admission", () =>
  Effect.gen(function* () {
    class Authority extends Context.Service<Authority, { readonly id: number }>()(
      "Test/Authority",
    ) {}
    const active = yield* Effect.promise(() =>
      activateDrizzleService(defineDrizzleService({ schema: { records }, client: () => ({}) }), {}),
    );
    const defect = new Error("defect");
    expect(
      yield* withDrizzleWork(active, Authority).pipe(Effect.provideService(Authority, { id: 42 })),
    ).toEqual({ id: 42 });
    const exit = yield* Effect.exit(withDrizzleWork(active, Effect.die(defect)));
    expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe(defect);
    yield* Effect.promise(() => active.close());
    const error = yield* Effect.flip(withDrizzleWork(active, Effect.void));
    expect(error).toBeInstanceOf(DrizzleFailure);
  }),
);

it.effect("direct Layer disposal drains work running in an external Effect fiber", () =>
  Effect.gen(function* () {
    const completed = gate<void>();
    const entered = yield* Deferred.make<void>();
    let disposed = 0;
    const runtime = ManagedRuntime.make(
      drizzleOwnerLayer(
        drizzleRuntimeOf(
          defineDrizzleService({
            schema: { records },
            client: () => ({}),
            dispose: () => {
              disposed++;
            },
          }),
        ),
        {},
      ),
    );
    const owner = yield* Effect.promise(() => runtime.runPromise(DrizzleOwner));
    const work = yield* Effect.forkChild(
      owner.work(
        Effect.andThen(
          Deferred.succeed(entered, undefined),
          nativeCall("query", () => completed.promise),
        ),
      ),
    );
    yield* Deferred.await(entered);
    const closing = runtime.dispose();
    expect(yield* Ref.get(owner.admission)).toEqual({ active: 1, closing: true });
    expect(disposed).toBe(0);
    completed.resolve(undefined);
    yield* Fiber.join(work);
    yield* Effect.promise(() => closing);
    expect(disposed).toBe(1);
  }),
);

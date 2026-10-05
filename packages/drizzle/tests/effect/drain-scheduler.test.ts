import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Effect, Fiber, Ref, Scheduler } from "effect";
import { makeDrizzleOwner } from "../../src/owner.js";

it.effect("drain verifies admission when scheduling pauses before the latch closes", () =>
  Effect.gen(function* () {
    const owner = yield* makeDrizzleOwner({});
    const tasks: Array<() => void> = [];
    let pause = true;
    const scheduler = new Scheduler.MixedScheduler("async", (task) => {
      tasks.push(task);
      return () => undefined;
    });
    scheduler.shouldYield = () =>
      pause && Ref.getUnsafe(owner.admission).active === 1 && owner.drained.isOpen();
    const work = Effect.runFork(
      owner.work(Effect.void).pipe(Effect.provideService(Scheduler.Scheduler, scheduler)),
    );
    for (let count = 0; count < 100 && Ref.getUnsafe(owner.admission).active === 0; count++) {
      const task = tasks.shift();
      if (task === undefined) break;
      task();
    }
    expect(Ref.getUnsafe(owner.admission)).toEqual({ active: 1, closing: false });
    expect(owner.drained.isOpen()).toBe(true);
    yield* owner.beginClose();
    let drained = false;
    const close = yield* Effect.forkChild(
      Effect.andThen(
        owner.awaitDrained(),
        Effect.sync(() => {
          drained = true;
        }),
      ),
    );
    yield* Effect.yieldNow;
    expect(drained).toBe(false);
    pause = false;
    while (tasks.length > 0) tasks.shift()?.();
    yield* Fiber.join(work);
    yield* Fiber.join(close);
    expect(drained).toBe(true);
    expect(Ref.getUnsafe(owner.admission)).toEqual({ active: 0, closing: true });
  }),
);

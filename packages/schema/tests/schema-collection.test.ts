import { describe, expect, test, vi } from "vitest";
import { Effect, Fiber } from "effect";
import { collectResults, collectUnion, resolveTasksEffect } from "../src/schema-collection.js";

describe("bounded child validation", () => {
  test("starts at most eight tasks and preserves input order", async () => {
    let active = 0;
    let started = 0;
    let maximum = 0;
    const release: Array<() => void> = [];
    const tasks = Array.from(
      { length: 20 },
      (_, index) => () =>
        new Promise<{ value: number }>((resolve) => {
          active += 1;
          started += 1;
          maximum = Math.max(maximum, active);
          release[index] = () => {
            active -= 1;
            resolve({ value: index });
          };
        }),
    );
    const pending = Effect.runPromise(resolveTasksEffect(tasks));
    await vi.waitFor(() => expect(started).toBe(8));
    for (let index = 7; index >= 0; index -= 1) release[index]!();
    await vi.waitFor(() => expect(started).toBe(16));
    for (let index = 15; index >= 8; index -= 1) release[index]!();
    await vi.waitFor(() => expect(started).toBe(20));
    for (let index = 19; index >= 16; index -= 1) release[index]!();
    expect((await pending).map((result) => ("value" in result ? result.value : undefined))).toEqual(
      Array.from({ length: 20 }, (_, index) => index),
    );
    expect(maximum).toBe(8);
    expect(active).toBe(0);
  });

  test("reports the earliest rejected input after ordered completion", async () => {
    const tasks = [
      () =>
        new Promise<{ value: number }>((_, reject) =>
          setTimeout(() => reject(new Error("first")), 5),
        ),
      () => Promise.reject(new Error("second")),
      () => Promise.resolve({ value: 3 }),
    ];
    const recovered = await Effect.runPromise(
      resolveTasksEffect(tasks).pipe(
        Effect.catchTag("SchemaExecutionError", (error) => Effect.succeed(error.cause)),
      ),
    );
    expect(recovered).toBeInstanceOf(Error);
    expect((recovered as Error).message).toBe("first");
  });

  test("stops scheduling new work when interrupted", async () => {
    let started = 0;
    const tasks = Array.from({ length: 20 }, () => () => {
      started += 1;
      return new Promise<{ value: number }>(() => undefined);
    });
    const startedFiber = Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* resolveTasksEffect(tasks).pipe(Effect.forkChild);
        yield* Effect.sleep(10);
        return yield* Fiber.interrupt(fiber);
      }),
    );
    await startedFiber;
    expect(started).toBe(8);
  });

  test("keeps synchronous results synchronous and ordered", () => {
    expect(
      collectResults(
        [
          () => ({ value: 1 }),
          () => ({ issues: [{ message: "bad" }] }),
          () => ({ issues: [{ message: "later" }] }),
        ],
        (values) => values,
      ),
    ).toEqual({
      issues: [{ message: "bad" }, { message: "later" }],
    });
    expect(
      collectUnion([() => ({ issues: [{ message: "bad" }] }), () => ({ value: "ok" })], []),
    ).toEqual({ value: "ok" });
    expect(collectUnion([() => ({ issues: [{ message: "bad" }] })], ["field"])).toEqual({
      issues: [{ message: "Value did not match any union member", path: ["field"] }],
    });
  });
});

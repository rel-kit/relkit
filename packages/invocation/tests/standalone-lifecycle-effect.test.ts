import { describe, expect, test, vi } from "vitest";
import { Effect, Fiber, Layer } from "effect";
import { z } from "@relkit/schema";
import { defaultRunner } from "../src/validation.js";
import {
  StandaloneLifecycleFailure,
  StandaloneLifecycleRunner,
  runStandaloneLifecycle,
  runStandaloneLifecycleEffect,
} from "../src/standalone-lifecycle.js";

function options() {
  const signal = new AbortController().signal;
  return {
    target: {
      id: "tasks.run",
      input: z.number(),
      output: z.number(),
      handler: (value: number) => value + 1,
    },
    input: 1,
    context: { signal },
    runner: defaultRunner,
    signal,
  };
}

describe("standalone lifecycle Effect", () => {
  test("substitutes the runner and preserves dependent phase order", async () => {
    const phases: number[] = [];
    const layer = Layer.succeed(StandaloneLifecycleRunner, {
      run: async (effect, runnerOptions) => {
        phases.push(phases.length + 1);
        return Effect.runPromise(effect, runnerOptions);
      },
    });
    expect(
      await Effect.runPromise(Effect.provide(runStandaloneLifecycleEffect(options()), layer)),
    ).toBe(2);
    expect(phases).toEqual([1, 2, 3]);
    expect(await runStandaloneLifecycle(options())).toBe(2);
  });

  test("tags a failing phase and preserves public rejection", async () => {
    const cause = new Error("runner unavailable");
    let calls = 0;
    const runner = {
      run: async () => {
        calls += 1;
        if (calls === 2) throw cause;
        return 1;
      },
    };
    const typed = await Effect.runPromise(
      Effect.catchTag(
        runStandaloneLifecycleEffect({ ...options(), runner }),
        "StandaloneLifecycleFailure",
        (error) => Effect.succeed(error),
      ),
    );
    expect(typed).toBeInstanceOf(StandaloneLifecycleFailure);
    expect(typed).toMatchObject({ phase: "handler", cause });
    calls = 0;
    await expect(runStandaloneLifecycle({ ...options(), runner })).rejects.toBe(cause);
  });

  test("interrupts a pending handler through the public lifecycle Effect", async () => {
    const controller = new AbortController();
    let started!: () => void;
    const handlerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let handlerSignal!: AbortSignal;
    const base = options();
    const fiber = Effect.runFork(
      runStandaloneLifecycleEffect({
        ...base,
        signal: controller.signal,
        context: { signal: controller.signal },
        target: {
          ...base.target,
          handler: (_input, context) => {
            handlerSignal = context.signal;
            started();
            return new Promise<number>(() => undefined);
          },
        },
      }),
    );

    try {
      await handlerStarted;
      await Effect.runPromise(Fiber.interrupt(fiber));
      expect(handlerSignal.aborted).toBe(true);
    } finally {
      controller.abort();
    }
  });

  test("unlinks its caller signal when a runner ignores interruption", async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    let started!: () => void;
    const phaseStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let runnerSignal!: AbortSignal;
    let phases = 0;
    const runner = {
      run: <A, E>(
        effect: Effect.Effect<A, E, never>,
        runnerOptions?: { readonly signal?: AbortSignal },
      ): Promise<A> => {
        phases++;
        if (phases === 1) return Effect.runPromise(effect, runnerOptions);
        if (runnerOptions?.signal === undefined) throw new Error("Missing runner signal");
        runnerSignal = runnerOptions.signal;
        started();
        return new Promise<never>(() => undefined);
      },
    };
    const base = options();
    const fiber = Effect.runFork(
      runStandaloneLifecycleEffect({
        ...base,
        context: { signal: controller.signal },
        signal: controller.signal,
        runner,
      }),
    );

    await phaseStarted;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(runnerSignal.aborted).toBe(true);
    expect(remove).toHaveBeenCalledTimes(add.mock.calls.length);
    add.mockRestore();
    remove.mockRestore();
  });
});

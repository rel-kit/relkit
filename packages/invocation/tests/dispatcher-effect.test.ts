import { describe, expect, test, vi } from "vitest";
import { Effect, Fiber, Layer } from "effect";
import { z } from "@relkit/schema";
import {
  DispatcherBoundary,
  InvocationDispatchFailure,
  currentInvocationDispatcherEffect,
  dispatchInvocation,
  dispatchInvocationEffect,
  runInInvocationScope,
} from "../src/index.js";
import type { InvocationDispatcher, InvocationTarget } from "../src/index.js";

const target: InvocationTarget = {
  id: "orders.lookup",
  input: z.object({}),
  output: z.string(),
  handler: () => "standalone",
};

describe("Effect dispatch boundary", () => {
  test("substitutes scoped and fallback dispatchers through a Layer", async () => {
    let fallbacks = 0;
    const dispatcher: InvocationDispatcher = {
      dispatch: async () => "injected" as never,
    };
    const scoped = Layer.succeed(DispatcherBoundary, {
      current: () => dispatcher,
      fallback: () => {
        fallbacks += 1;
        return dispatcher;
      },
    });
    expect(Effect.runSync(Effect.provide(currentInvocationDispatcherEffect(), scoped))).toBe(
      dispatcher,
    );
    expect(
      await Effect.runPromise(
        Effect.provide(dispatchInvocationEffect({ target, input: {} }), scoped),
      ),
    ).toBe("injected");
    expect(fallbacks).toBe(0);

    const standalone = Layer.succeed(DispatcherBoundary, {
      current: () => undefined,
      fallback: () => {
        fallbacks += 1;
        return dispatcher;
      },
    });
    expect(
      await Effect.runPromise(
        Effect.provide(dispatchInvocationEffect({ target, input: {} }), standalone),
      ),
    ).toBe("injected");
    expect(fallbacks).toBe(1);
  });

  test("tags dispatcher failures and preserves the public rejection", async () => {
    const failure = new Error("dispatcher offline");
    const dispatcher: InvocationDispatcher = {
      dispatch: async () => {
        throw failure;
      },
    };
    const layer = Layer.succeed(DispatcherBoundary, {
      current: () => dispatcher,
      fallback: () => dispatcher,
    });
    const typed = await Effect.runPromise(
      Effect.provide(
        Effect.catchTag(
          dispatchInvocationEffect({ target, input: {} }),
          "InvocationDispatchFailure",
          (error) => Effect.succeed(error),
        ),
        layer,
      ),
    );
    expect(typed).toBeInstanceOf(InvocationDispatchFailure);
    expect(typed.cause).toBe(failure);
    await runInInvocationScope({ dispatcher }, async () => {
      await expect(dispatchInvocation({ target, input: {} })).rejects.toBe(failure);
    });
  });

  test("interrupts a standalone dispatch and releases its handler", async () => {
    let started!: () => void;
    let released!: () => void;
    const handlerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const invocationReleased = new Promise<void>((resolve) => {
      released = resolve;
    });
    const controller = new AbortController();
    let handlerSignal!: AbortSignal;
    const outcomes: string[] = [];
    const fiber = Effect.runFork(
      dispatchInvocationEffect({
        target: {
          ...target,
          handler: (_input, context) => {
            handlerSignal = context.signal;
            started();
            return new Promise<string>(() => undefined);
          },
        },
        input: {},
        options: {
          signal: controller.signal,
          onCompletion: ({ outcome }) => {
            outcomes.push(outcome);
          },
          onRelease: () => {
            released();
          },
        },
      }),
    );

    try {
      await handlerStarted;
      await Effect.runPromise(Fiber.interrupt(fiber));
      expect(handlerSignal.aborted).toBe(true);
      await invocationReleased;
      expect(outcomes).toEqual(["cancelled"]);
    } finally {
      controller.abort();
    }
  });

  test("unlinks the caller signal after success or synchronous dispatch failure", async () => {
    for (const shouldThrow of [false, true]) {
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, "addEventListener");
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const failure = new Error("dispatch failed before returning a promise");
      const dispatcher: InvocationDispatcher = {
        dispatch: () => {
          if (shouldThrow) throw failure;
          return Promise.resolve("done" as never);
        },
      };
      const layer = Layer.succeed(DispatcherBoundary, {
        current: () => dispatcher,
        fallback: () => dispatcher,
      });
      const result = Effect.runPromise(
        Effect.provide(
          dispatchInvocationEffect({ target, input: {}, options: { signal: controller.signal } }),
          layer,
        ),
      );

      if (shouldThrow) await expect(result).rejects.toMatchObject({ cause: failure });
      else expect(await result).toBe("done");
      expect(add).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledTimes(1);
      add.mockRestore();
      remove.mockRestore();
    }
  });

  test("unlinks the caller signal when a dispatcher ignores interruption", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    let started!: () => void;
    const dispatchStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let dispatchedSignal!: AbortSignal;
    const dispatcher: InvocationDispatcher = {
      dispatch: (request) => {
        if (request.options?.signal === undefined) throw new Error("Missing dispatch signal");
        dispatchedSignal = request.options.signal;
        started();
        return new Promise<never>(() => undefined);
      },
    };
    const layer = Layer.succeed(DispatcherBoundary, {
      current: () => dispatcher,
      fallback: () => dispatcher,
    });
    const fiber = Effect.runFork(
      Effect.provide(
        dispatchInvocationEffect({ target, input: {}, options: { signal: controller.signal } }),
        layer,
      ),
    );

    await dispatchStarted;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(dispatchedSignal.aborted).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
    remove.mockRestore();
  });
});

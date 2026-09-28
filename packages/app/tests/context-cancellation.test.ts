import { Effect, Fiber } from "effect";
import { expect, test, vi } from "vitest";
import { defineConstants } from "../src/context-descriptors.js";
import { AppConstantRunnerLive } from "../src/context-resolution-service.js";
import { createApplicationContextResolver } from "../src/context-resolver.js";
const noop = (): void => undefined;
const log = { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
test("an aborted caller signal prevents direct Effect resolution from starting", async () => {
  let started = 0;
  const resolver = createApplicationContextResolver({
    env: {},
    constants: { dynamic: defineConstants({ value: () => ++started }) },
  });
  const controller = new AbortController();
  controller.abort();
  await expect(
    Effect.runPromise(
      resolver
        .resolveEffect({ signal: controller.signal, log })
        .pipe(Effect.provide(AppConstantRunnerLive)),
    ),
  ).rejects.toThrow();
  expect(started).toBe(0);
});
test("caller cancellation interrupts an active direct Effect resolution", async () => {
  let notifyStart = (): void => undefined;
  const started = new Promise<void>((resolve) => {
    notifyStart = resolve;
  });
  let callbackSignal: AbortSignal | undefined;
  const resolver = createApplicationContextResolver({
    env: {},
    constants: {
      dynamic: defineConstants({
        value: ({ signal }: { signal: AbortSignal }) => {
          callbackSignal = signal;
          notifyStart();
          return new Promise<never>(() => undefined);
        },
      }),
    },
  });
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  const pending = Effect.runPromise(
    resolver
      .resolveEffect({ signal: controller.signal, log })
      .pipe(Effect.provide(AppConstantRunnerLive)),
  );
  await started;
  const reason = new Error("caller cancelled");
  controller.abort(reason);
  await expect(pending).rejects.toThrow();
  expect(callbackSignal?.aborted).toBe(true);
  expect(callbackSignal?.reason).toBe(reason);
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});
test("interrupting the exported Effect fiber aborts its callback", async () => {
  let notifyStart = (): void => undefined;
  const started = new Promise<void>((resolve) => {
    notifyStart = resolve;
  });
  let callbackSignal: AbortSignal | undefined;
  const resolver = createApplicationContextResolver({
    env: {},
    constants: {
      dynamic: defineConstants({
        value: ({ signal }: { signal: AbortSignal }) => {
          callbackSignal = signal;
          notifyStart();
          return new Promise<never>(() => undefined);
        },
      }),
    },
  });
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  const fiber = Effect.runFork(
    resolver
      .resolveEffect({ signal: controller.signal, log })
      .pipe(Effect.provide(AppConstantRunnerLive)),
  );
  await started;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(callbackSignal?.aborted).toBe(true);
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});
test("the cancellation listener is removed after success and failure", async () => {
  for (const shouldFail of [false, true]) {
    const resolver = createApplicationContextResolver({
      env: {},
      constants: {
        dynamic: defineConstants({
          value: () => {
            if (shouldFail) throw new Error("failed");
            return 1;
          },
        }),
      },
    });
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const result = Effect.runPromise(
      resolver
        .resolveEffect({ signal: controller.signal, log })
        .pipe(Effect.provide(AppConstantRunnerLive)),
    );
    if (shouldFail) await expect(result).rejects.toThrow("failed");
    else await expect(result).resolves.toMatchObject({ constants: { value: 1 } });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  }
});
test("synchronous abort during listener registration removes the listener", async () => {
  let started = 0;
  const resolver = createApplicationContextResolver({
    env: {},
    constants: { dynamic: defineConstants({ value: () => ++started }) },
  });
  const controller = new AbortController();
  const add = controller.signal.addEventListener.bind(controller.signal);
  vi.spyOn(controller.signal, "addEventListener").mockImplementation((type, listener, options) => {
    add(type, listener, options);
    controller.abort();
  });
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  await expect(
    Effect.runPromise(
      resolver
        .resolveEffect({ signal: controller.signal, log })
        .pipe(Effect.provide(AppConstantRunnerLive)),
    ),
  ).rejects.toThrow();
  expect(started).toBe(0);
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});
test("cancellation between the initial check and listener registration prevents work", async () => {
  for (const abortAtRead of [2, 3]) {
    let started = 0;
    const resolver = createApplicationContextResolver({
      env: {},
      constants: { dynamic: defineConstants({ value: () => ++started }) },
    });
    const controller = new AbortController();
    let reads = 0;
    Object.defineProperty(controller.signal, "aborted", {
      get: () => ++reads >= abortAtRead,
    });
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await expect(
      Effect.runPromise(
        resolver
          .resolveEffect({ signal: controller.signal, log })
          .pipe(Effect.provide(AppConstantRunnerLive)),
      ),
    ).rejects.toThrow();
    expect(started).toBe(0);
    if (abortAtRead === 3) expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  }
});

import { describe, expect, test } from "vitest";
import { Effect, Fiber, Layer } from "effect";
import {
  AbortIO,
  AbortOperationFailure,
  abortablePromise,
  abortablePromiseEffect,
  createAbortBridge,
  createAbortBridgeEffect,
} from "../src/index.js";

describe("invocation abort operations", () => {
  test("links fiber and parent signals with idempotent cleanup", () => {
    const fiber = new AbortController();
    const parent = new AbortController();
    const bridge = Effect.runSync(createAbortBridgeEffect(fiber.signal, parent.signal));
    expect(bridge.signal.aborted).toBe(false);
    const reason = new Error("parent stopped");
    parent.abort(reason);
    expect(bridge.signal.aborted).toBe(true);
    expect(bridge.signal.reason).toBe(reason);
    Effect.runSync(bridge.disposeEffect());
    bridge.dispose();

    const preAborted = new AbortController();
    preAborted.abort("already stopped");
    expect(createAbortBridge(fiber.signal, preAborted.signal).signal.reason).toBe(
      "already stopped",
    );
  });

  test("runs a Promise operation and preserves its public result", async () => {
    const signal = new AbortController().signal;
    expect(
      await Effect.runPromise(
        abortablePromiseEffect(signal, async (received) => {
          expect(received).toBe(signal);
          return 42;
        }),
      ),
    ).toBe(42);
    expect(await abortablePromise(signal, async () => "ready")).toBe("ready");
  });

  test("tags operation failures and rethrows the original public cause", async () => {
    const signal = new AbortController().signal;
    const failure = new Error("provider offline");
    const tagged = await Effect.runPromise(
      Effect.catchTag(
        abortablePromiseEffect(signal, async () => {
          throw failure;
        }),
        "AbortOperationFailure",
        (error) => Effect.succeed(error),
      ),
    );
    expect(tagged).toBeInstanceOf(AbortOperationFailure);
    expect(tagged.kind).toBe("operation");
    expect(tagged.cause).toBe(failure);
    await expect(
      abortablePromise(signal, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });

  test("aborts pending work promptly without starting late operations", async () => {
    const controller = new AbortController();
    let starts = 0;
    const pending = abortablePromise(controller.signal, async () => {
      starts += 1;
      return new Promise<number>(() => undefined);
    });
    const reason = new Error("cancelled");
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(starts).toBe(0);

    const already = new AbortController();
    already.abort(reason);
    const tagged = await Effect.runPromise(
      Effect.catchTag(
        abortablePromiseEffect(already.signal, async () => 1),
        "AbortOperationFailure",
        (error) => Effect.succeed(error),
      ),
    );
    expect(tagged.kind).toBe("aborted");
    expect(tagged.cause).toBe(reason);
  });

  test("substitutes controller and listener operations through a Layer", () => {
    let listeners = 0;
    let removals = 0;
    const layer = Layer.succeed(AbortIO, {
      createController: () => new AbortController(),
      listen: (signal: AbortSignal, onAbort: () => void) => {
        listeners += 1;
        signal.addEventListener("abort", onAbort);
        return () => {
          removals += 1;
          signal.removeEventListener("abort", onAbort);
        };
      },
    });
    const bridge = Effect.runSync(
      Effect.provide(
        createAbortBridgeEffect(new AbortController().signal, new AbortController().signal),
        layer,
      ),
    );
    expect(listeners).toBe(2);
    bridge.dispose();
    expect(removals).toBe(2);
  });

  test("releases a bridge listener if later registration fails", () => {
    let registrations = 0;
    let removals = 0;
    const layer = Layer.succeed(AbortIO, {
      createController: () => new AbortController(),
      listen: () => {
        registrations += 1;
        if (registrations === 2) throw new Error("registration failed");
        return () => {
          removals += 1;
        };
      },
    });
    expect(() =>
      Effect.runSync(
        Effect.provide(
          createAbortBridgeEffect(new AbortController().signal, new AbortController().signal),
          layer,
        ),
      ),
    ).toThrow("registration failed");
    expect(removals).toBe(1);
  });

  test("catches an abort during bridge registration", () => {
    const fiber = new AbortController();
    const bridge = Effect.runSync(
      Effect.provide(
        createAbortBridgeEffect(fiber.signal),
        Layer.succeed(AbortIO, {
          createController: () => new AbortController(),
          listen: () => {
            fiber.abort("raced");
            return () => undefined;
          },
        }),
      ),
    );
    expect(bridge.signal.reason).toBe("raced");
    bridge.dispose();
  });

  test("releases the Promise listener after success and operation failure", async () => {
    let removals = 0;
    const layer = Layer.succeed(AbortIO, {
      createController: () => new AbortController(),
      listen: () => () => {
        removals += 1;
      },
    });
    const signal = new AbortController().signal;
    expect(
      await Effect.runPromise(
        Effect.provide(
          abortablePromiseEffect(signal, async () => 1),
          layer,
        ),
      ),
    ).toBe(1);
    await expect(
      Effect.runPromise(
        Effect.provide(
          abortablePromiseEffect(signal, async () => {
            throw new Error("failed");
          }),
          layer,
        ),
      ),
    ).rejects.toBeInstanceOf(AbortOperationFailure);
    expect(removals).toBe(2);
  });

  test("releases a listener when abort happens during registration", async () => {
    const controller = new AbortController();
    let removals = 0;
    let starts = 0;
    const layer = Layer.succeed(AbortIO, {
      createController: () => new AbortController(),
      listen: (_signal: AbortSignal, onAbort: () => void) => {
        controller.abort("during registration");
        onAbort();
        return () => {
          removals += 1;
        };
      },
    });
    const failure = await Effect.runPromise(
      Effect.catchTag(
        Effect.provide(
          abortablePromiseEffect(controller.signal, async () => {
            starts += 1;
            return 1;
          }),
          layer,
        ),
        "AbortOperationFailure",
        (error) => Effect.succeed(error),
      ),
    );
    expect(failure.kind).toBe("aborted");
    expect(failure.cause).toBe("during registration");
    expect(starts).toBe(0);
    expect(removals).toBe(1);
  });

  test("aborts in-flight work and releases its listener", async () => {
    const controller = new AbortController();
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    let removals = 0;
    const layer = Layer.succeed(AbortIO, {
      createController: () => new AbortController(),
      listen: (signal: AbortSignal, onAbort: () => void) => {
        signal.addEventListener("abort", onAbort);
        return () => {
          removals += 1;
          signal.removeEventListener("abort", onAbort);
        };
      },
    });
    const pending = Effect.runPromise(
      Effect.provide(
        abortablePromiseEffect(controller.signal, async () => {
          signalStarted();
          return new Promise<number>(() => undefined);
        }),
        layer,
      ),
    );
    await started;
    controller.abort("while running");
    await expect(pending).rejects.toBeInstanceOf(AbortOperationFailure);
    expect(removals).toBe(1);
  });

  test("removes the listener when an Effect fiber is interrupted", async () => {
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let removals = 0;
    const layer = Layer.succeed(AbortIO, {
      createController: () => new AbortController(),
      listen: (signal: AbortSignal, onAbort: () => void) => {
        signal.addEventListener("abort", onAbort);
        ready();
        return () => {
          removals++;
          signal.removeEventListener("abort", onAbort);
        };
      },
    });
    const fiber = Effect.runFork(
      Effect.provide(
        abortablePromiseEffect(
          new AbortController().signal,
          async () => new Promise<number>(() => undefined),
        ),
        layer,
      ),
    );
    await started;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(removals).toBe(1);
  });
});

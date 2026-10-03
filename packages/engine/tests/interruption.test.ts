import { expect, it } from "@effect/vitest";
import { z } from "@relkit/schema";
import { Deferred, Effect, Fiber, Ref } from "effect";
import { ConcurrencyAdmission } from "../src/concurrency.js";
import { runEnginePromise, runEngineSync } from "../src/engine-runtime.js";
import { invokeEffect } from "../src/invoke.js";
import { GenerationLifecycle } from "../src/lifecycle.js";

it.effect("waits for native invocation cleanup before interruption completes", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const releasing = yield* Deferred.make<void>();
    const releaseGate = yield* Deferred.make<void>();
    const interrupted = yield* Ref.make(false);
    let releases = 0;
    const fiber = yield* invokeEffect({
      target: {
        id: "wait.cleanup",
        input: z.unknown(),
        output: z.unknown(),
        handler: (_input, context) =>
          new Promise((_resolve, reject) => {
            runEngineSync(Deferred.succeed(started, undefined));
            context.signal.addEventListener("abort", () => reject(context.signal.reason), {
              once: true,
            });
          }),
      },
      input: null,
      admit: () => ({
        release: async () => {
          releases += 1;
          runEngineSync(Deferred.succeed(releasing, undefined));
          await runEnginePromise(Deferred.await(releaseGate));
        },
      }),
    }).pipe(Effect.forkChild);
    yield* Deferred.await(started);
    const shutdown = yield* Fiber.interrupt(fiber).pipe(
      Effect.tap(() => Ref.set(interrupted, true)),
      Effect.forkChild,
    );
    yield* Deferred.await(releasing);
    expect(yield* Ref.get(interrupted)).toBe(false);
    yield* Deferred.succeed(releaseGate, undefined);
    yield* Fiber.join(shutdown);
    expect(releases).toBe(1);
    expect(yield* Ref.get(interrupted)).toBe(true);
  }),
);

it.effect("rejects queued work on generation drain without negative waiter counts", () =>
  Effect.gen(function* () {
    const generation = new GenerationLifecycle();
    generation.markReady();
    const admission = new ConcurrencyAdmission({ generation });
    const request = {
      functionId: "drain.queue",
      source: "direct" as const,
      limit: 1,
      signal: new AbortController().signal,
    };
    const lease = yield* admission.acquireEffect(request);
    const first = yield* admission.acquireEffect(request).pipe(Effect.forkChild);
    const second = yield* admission.acquireEffect(request).pipe(Effect.forkChild);
    yield* Effect.yieldNow;
    expect(admission.waitingCount(request.functionId)).toBe(2);
    generation.beginDrain();
    lease.release();
    yield* Fiber.join(first).pipe(Effect.exit);
    yield* Fiber.join(second).pipe(Effect.exit);
    expect(admission.waitingCount(request.functionId)).toBe(0);
    expect(admission.activeCount(request.functionId)).toBe(0);
    expect(generation.activeCount).toBe(0);
  }),
);

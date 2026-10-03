import { describe, expect, it } from "@effect/vitest";
import { z } from "@relkit/schema";
import { Deferred, Effect, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";
import { AdmissionService, admissionLayer } from "../src/concurrency.js";
import { runEngineSync } from "../src/engine-runtime.js";
import { runTaskHook } from "../src/invoke-lifecycle.js";
import { InvocationLive, InvocationService } from "../src/invoke.js";
import { GenerationLive, GenerationService, makeGeneration } from "../src/lifecycle.js";

describe("engine service lifetimes", () => {
  it.effect("checks the documented generation layer and idempotent leases", () =>
    Effect.gen(function* () {
      const generation = yield* GenerationService;
      yield* generation.markReady();
      const lease = yield* generation.acquire();
      const waiting = yield* generation.waitForIdle().pipe(Effect.forkChild);
      yield* generation.beginDrain();
      expect((yield* generation.snapshot()).activeCount).toBe(1);
      lease.release();
      lease.release();
      yield* Fiber.join(waiting);
      yield* generation.beginShutdown();
      yield* generation.completeShutdown();
      expect(yield* generation.snapshot()).toEqual({
        state: "shutdown",
        activeCount: 0,
        accepting: false,
      });
    }).pipe(Effect.provide(GenerationLive)),
  );

  it.effect("substitutes a deterministic generation layer without changing consumers", () =>
    Effect.gen(function* () {
      const service = yield* makeGeneration();
      yield* service.markReady();
      const read = Effect.gen(function* () {
        return yield* (yield* GenerationService).snapshot();
      });
      expect(
        yield* read.pipe(Effect.provide(Layer.succeed(GenerationService, service))),
      ).toMatchObject({ accepting: true });
    }),
  );

  it.effect("interrupts a queued caller without losing capacity or FIFO order", () =>
    Effect.gen(function* () {
      const admission = yield* AdmissionService;
      const request = {
        functionId: "orders.get",
        source: "direct" as const,
        limit: 1,
        signal: new AbortController().signal,
      };
      const lease = yield* admission.acquire(request);
      const blocked = yield* admission.acquire(request).pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      expect(yield* admission.waitingCount("orders.get")).toBe(1);
      yield* Fiber.interrupt(blocked);
      expect(yield* admission.waitingCount("orders.get")).toBe(0);
      expect(yield* admission.activeCount("orders.get")).toBe(1);
      lease.release();
      const next = yield* admission.acquire(request);
      next.release();
      expect(yield* admission.activeCount("orders.get")).toBe(0);
    }).pipe(Effect.provide(admissionLayer())),
  );

  it.effect("bounds hooks with controlled time and aborts their native signal", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const warnings: unknown[] = [];
      let signal: AbortSignal | undefined;
      const hook = (_value: unknown, context: { readonly signal: AbortSignal }) => {
        signal = context.signal;
        runEngineSync(Deferred.succeed(started, undefined));
        return new Promise<void>(() => undefined);
      };
      const task = yield* runTaskHook(
        hook,
        "success",
        { secret: "not logged" },
        {
          signal: new AbortController().signal,
          log: {
            warn: (...values: unknown[]) => {
              warnings.push(values);
            },
          },
        },
        undefined,
      ).pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* TestClock.adjust(5_000);
      yield* Fiber.join(task);
      expect(signal?.aborted).toBe(true);
      expect(warnings).toEqual([
        ["Task lifecycle hook diagnostic", { hook: "success", reason: "timeout" }],
      ]);
    }),
  );

  it.effect("checks the invocation service example with its live layer", () =>
    Effect.gen(function* () {
      const invocation = yield* InvocationService;
      const value = yield* invocation.invoke({
        target: {
          id: "orders.echo",
          input: z.number(),
          output: z.number(),
          handler: (input) => input,
        },
        input: 7,
      });
      expect(value).toBe(7);
    }).pipe(Effect.provide(InvocationLive)),
  );
});

import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import { createDrainLayer, SupervisorDrainOwner } from "../../src/drain-service.js";

const token = { sourceToken: 1, generationToken: 1 };
const quiet = createLoggerLayer({ human: false, json: false });

it.effect("closes candidate first and providers in reverse order under one absolute budget", () =>
  Effect.gen(function* () {
    const candidateStarted = yield* Deferred.make<void>();
    const providerStarted = yield* Deferred.make<void>();
    const order: string[] = [];
    let finishCandidate: (() => void) | undefined;
    let finishProvider: (() => void) | undefined;
    const layer = createDrainLayer(
      {
        token,
        candidate: {
          token,
          dispose: () => {
            order.push("candidate");
            Deferred.doneUnsafe(candidateStarted, Effect.void);
            return new Promise<void>((resolve) => {
              finishCandidate = resolve;
            });
          },
        },
        providers: [
          {
            id: "first",
            close: () => {
              order.push("first");
            },
          },
          {
            id: "second",
            close: () => {
              order.push("second");
              Deferred.doneUnsafe(providerStarted, Effect.void);
              return new Promise<void>((resolve) => {
                finishProvider = resolve;
              });
            },
          },
        ],
      },
      100,
    );
    yield* Effect.gen(function* () {
      const service = yield* SupervisorDrainOwner;
      const draining = yield* Effect.forkChild(service.drain);
      yield* Deferred.await(candidateStarted);
      yield* TestClock.adjust(60);
      finishCandidate?.();
      yield* Deferred.await(providerStarted);
      yield* TestClock.adjust(40);
      const report = yield* Fiber.join(draining);
      expect(order).toEqual(["candidate", "second", "first"]);
      expect(report).toMatchObject({
        deadlineMs: 100,
        elapsedMs: 100,
        candidate: "closed",
        outcome: "timed-out",
      });
      expect(report.providers).toEqual([
        { id: "first", status: "closed" },
        { id: "second", status: "timed-out" },
      ]);
      expect(yield* service.drain).toBe(report);
      // The legacy native callback has no signal: settle it before releasing the fixture.
      finishProvider?.();
    }).pipe(Effect.provide(Layer.merge(layer, quiet)));
  }),
);

it.effect("waits on owned idle synchronization and cancels every remaining native lease once", () =>
  Effect.gen(function* () {
    const layer = createDrainLayer({ token }, 50);
    yield* Effect.gen(function* () {
      const service = yield* SupervisorDrainOwner;
      let interrupted = 0;
      const first = yield* service.track(token, {
        interrupt: () => {
          interrupted++;
        },
      });
      const second = yield* service.track(token, {});
      const draining = yield* Effect.forkChild(service.drain);
      yield* Effect.yieldNow;
      expect(yield* service.accepting).toBe(false);
      expect(yield* service.track(token, {})).toBeUndefined();
      first?.release();
      first?.release();
      expect(yield* service.inFlight).toBe(1);
      yield* TestClock.adjust(50);
      const report = yield* Fiber.join(draining);
      expect(report).toMatchObject({
        initialInFlight: 2,
        completed: 1,
        interrupted: 1,
        remaining: 1,
        elapsedMs: 50,
      });
      expect(interrupted).toBe(0);
      expect(first?.signal.aborted).toBe(false);
      expect(second?.signal.aborted).toBe(true);
      second?.release();
      expect(yield* service.inFlight).toBe(0);
    }).pipe(Effect.provide(Layer.merge(layer, quiet)));
  }),
);

/**
 * Verifies the benchmark stops admitting work when system headroom disappears.
 * Pure cases preserve the limits; a test clock exercises bounded container
 * admission, native failures and cancellation without changing machine settings.
 */
import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber } from "effect";
import { TestClock } from "effect/testing";
import {
  awaitConsumerResources,
  consumerResourceBlock,
  ConsumerResourceMonitor,
} from "../consumer-resources.js";
import { consumerInputFailure } from "../consumer-installation-native.js";

const normal = { cpus: 10, load: 4, pressure: 1, availableDiskBytes: 10 * 1024 ** 3 };

describe("consumer measurement resource admission", () => {
  it("admits one serial task when headroom exists", () => {
    expect(consumerResourceBlock(normal)).toBeNull();
  });

  it("backs off at warning pressure even with idle CPUs", () => {
    expect(consumerResourceBlock({ ...normal, pressure: 2 })).toMatch(/memory pressure/);
  });

  it("leaves CPU capacity for the user's work", () => {
    expect(consumerResourceBlock({ ...normal, load: 9 })).toMatch(/CPU/);
  });

  it("does not fill the remaining disk with a new fixture", () => {
    expect(consumerResourceBlock({ ...normal, availableDiskBytes: 3 * 1024 ** 3 })).toMatch(/disk/);
  });
});

it.effect("waits for the runner's load to settle before admitting container work", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    let inspections = 0;
    const fiber = yield* awaitConsumerResources("/fixture").pipe(
      Effect.provideService(ConsumerResourceMonitor, {
        inspect: (directory) =>
          Effect.gen(function* () {
            expect(directory).toBe("/fixture");
            inspections++;
            yield* Deferred.succeed(started, undefined);
            const resources = { ...normal, cpus: 4, load: inspections === 1 ? 3.15 : 0 };
            return { resources, blocked: consumerResourceBlock(resources) };
          }),
      }),
      Effect.forkScoped,
    );
    yield* Deferred.await(started);
    yield* TestClock.adjust("10 seconds");
    expect((yield* Fiber.join(fiber)).blocked).toBeNull();
    expect(inspections).toBe(2);
  }),
);

it.effect("returns the final rejection after five minutes without weakening limits", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    let inspections = 0;
    const fiber = yield* awaitConsumerResources("/fixture").pipe(
      Effect.provideService(ConsumerResourceMonitor, {
        inspect: () =>
          Effect.gen(function* () {
            inspections++;
            yield* Deferred.succeed(started, undefined);
            return {
              resources: { ...normal, pressure: 2 },
              blocked: "Deferred: memory pressure level 2",
            };
          }),
      }),
      Effect.forkScoped,
    );
    yield* Deferred.await(started);
    yield* TestClock.adjust("5 minutes");
    expect((yield* Fiber.join(fiber)).blocked).toBe("Deferred: memory pressure level 2");
    expect(inspections).toBe(31);
  }),
);

it.effect("propagates native inspection failures without retrying them", () =>
  Effect.gen(function* () {
    const failure = consumerInputFailure("resources.disk", "Filesystem unavailable");
    const error = yield* awaitConsumerResources("/fixture").pipe(
      Effect.provideService(ConsumerResourceMonitor, { inspect: () => Effect.fail(failure) }),
      Effect.flip,
    );
    expect(error).toBe(failure);
  }),
);

it.effect("cancels resource admission without another inspection", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    let inspections = 0;
    const fiber = yield* awaitConsumerResources("/fixture").pipe(
      Effect.provideService(ConsumerResourceMonitor, {
        inspect: () =>
          Effect.gen(function* () {
            inspections++;
            yield* Deferred.succeed(started, undefined);
            return { resources: normal, blocked: "Deferred: CPU load" };
          }),
      }),
      Effect.forkScoped,
    );
    yield* Deferred.await(started);
    yield* Fiber.interrupt(fiber);
    yield* TestClock.adjust("5 minutes");
    expect(Exit.isFailure(yield* Fiber.await(fiber))).toBe(true);
    expect(inspections).toBe(1);
  }),
);

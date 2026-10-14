/** Verifies cache/realtime/ephemeral Effect substitution, bounded admission and native producer cancellation without duplicating resource ownership. */
import { it, expect } from "@effect/vitest";

import { Cause, Clock, Deferred, Effect, Exit, Fiber, Layer, Random } from "effect";
import { TestClock } from "effect/testing";

import { join } from "node:path";

import {
  LocalCacheService,
  localCacheLayer,
  makeLocalCacheService,
} from "../../src/cache/provider.js";
import { LocalRealtimeService } from "../../src/realtime/provider.js";
import { ephemeralDeliveryLayer, LocalEphemeralService } from "../../src/events/ephemeral.js";
import { localSync, runLocal } from "../../src/local-effect.js";

import { CacheTest, RealtimeTest } from "./fixtures.js";

import { nativeNow, nativeRandom } from "../../src/native-services.js";

it.effect("native helpers retain the caller's deterministic Clock and Random", () =>
  Effect.gen(function* () {
    yield* TestClock.adjust(1234);
    expect(yield* localSync(nativeNow)).toBe(yield* Clock.currentTimeMillis);
    const first = yield* localSync(nativeRandom).pipe(Random.withSeed("provider-test"));
    const second = yield* localSync(nativeRandom).pipe(Random.withSeed("provider-test"));
    expect(first).toBe(second);
  }),
);

it.effect("concurrent cache closes share completion and reject later writes", () =>
  Effect.gen(function* () {
    const cache = yield* makeLocalCacheService();
    yield* cache.set("entry", "value");
    yield* Effect.all([cache.close(), cache.close()], { concurrency: 2 });
    const write = yield* Effect.result(cache.set("late", "value"));
    expect(write._tag).toBe("Failure");
    if (write._tag === "Failure")
      expect(write.failure.cause).toMatchObject({ code: "RELKIT_CACHE_STATE_INVALID" });
    expect((yield* cache.snapshot()).entries).toBe(0);
  }),
);

it.effect("substitutes cache and realtime layers using deterministic clocks", () =>
  Effect.gen(function* () {
    const cache = yield* LocalCacheService;
    const realtime = yield* LocalRealtimeService;
    expect(yield* realtime.getEpoch()).toBe("test-epoch");
    yield* cache.set("secret-key", { token: "secret-value" });
    expect(yield* cache.get("secret-key")).toEqual({ token: "secret-value" });
    yield* TestClock.adjust(100);
    expect(yield* cache.get("secret-key")).toBeUndefined();
  }).pipe(Effect.provide(Layer.merge(CacheTest, RealtimeTest))),
);

it.effect("interrupting one producer clears its flight and wakes followers", () =>
  Effect.gen(function* () {
    const cache = yield* makeLocalCacheService();
    const started = yield* Deferred.make<void>();
    const release = yield* Deferred.make<string>();
    const produce = () =>
      runLocal(Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release))));
    const owner = yield* Effect.forkChild(cache.getOrSet("key", produce));
    yield* Deferred.await(started);
    const follower = yield* Effect.forkChild(cache.getOrSet("key", () => "unexpected"));
    yield* Effect.yieldNow;
    yield* Fiber.interrupt(owner);
    const exit = yield* Fiber.await(follower);
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    expect((yield* cache.snapshot()).inFlight).toBe(0);
    expect(yield* cache.getOrSet("key", () => "replacement")).toBe("replacement");
    yield* Deferred.succeed(release, "discarded");
  }),
);

it.effect("cache live layer closes the same service on scope completion", () =>
  Effect.gen(function* () {
    const cache = yield* Effect.scoped(
      Effect.gen(function* () {
        const service = yield* LocalCacheService;
        yield* service.set("key", 1);
        return service;
      }).pipe(Effect.provide(localCacheLayer())),
    );
    const exit = yield* Effect.result(cache.get("key"));
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure")
      expect(exit.failure.cause).toMatchObject({ code: "RELKIT_CACHE_STATE_INVALID" });
  }),
);

it.effect("ephemeral scope joins admitted handlers and drops overflow without a backlog", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const release = yield* Deferred.make<string>();
    const layer = ephemeralDeliveryLayer(
      () =>
        runLocal(
          Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release))),
        ),
      1,
    );
    const event = {
      instanceId: "event",
      eventId: "changed",
      version: 1,
      payload: null,
      occurredAt: "now",
      publishedAt: "now",
      attributes: {},
    };
    const parent = yield* Effect.forkChild(
      Effect.scoped(
        Effect.gen(function* () {
          const service = yield* LocalEphemeralService;
          const first = yield* Effect.forkScoped(service.deliver(event));
          yield* Deferred.await(started);
          expect((yield* service.deliver(event)).status).toBe("dropped");
          yield* Deferred.succeed(release, "done");
          expect((yield* Fiber.join(first)).status).toBe("completed");
          expect((yield* service.snapshot()).inFlight).toBe(0);
        }).pipe(Effect.provide(layer)),
      ),
    );
    yield* Fiber.join(parent);
  }),
);

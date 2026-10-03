import { it, expect } from "@effect/vitest";
import { vi } from "vitest";
import {
  Cause,
  Clock,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Metric,
  Random,
  References,
} from "effect";
import { TestClock } from "effect/testing";
import { appendFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLoggerLayer, type LogRecord } from "@relkit/runtime-effect";
import {
  LocalCacheService,
  localCacheLayer,
  makeLocalCacheService,
} from "../../src/cache/provider.js";
import { LocalRealtimeService } from "../../src/realtime/provider.js";
import { ephemeralDeliveryLayer, LocalEphemeralService } from "../../src/events/ephemeral.js";
import { localOperation, localPromise, localSync, runLocal } from "../../src/local-effect.js";
import { makeAgentStateStore } from "../../src/agent-state/storage.js";
import { CacheTest, RealtimeTest } from "./fixtures.js";
import { createJobStore } from "../../src/jobs/store.js";
import { nativeNow, nativeRandom } from "../../src/native-services.js";

it.effect("journal recovery emits a bounded warning through the configured sink", () =>
  Effect.gen(function* () {
    const records: LogRecord[] = [];
    const root = yield* Effect.acquireRelease(
      localPromise(() => mkdtemp(join(tmpdir(), "relkit-recovery-log-"))),
      (path) => localPromise(() => rm(path, { force: true, recursive: true })).pipe(Effect.orDie),
    );
    const first = yield* localPromise(() => createJobStore(root));
    yield* localPromise(() => first.close());
    yield* localPromise(() => appendFile(first.paths.records, "secret-malformed-payload\n"));
    yield* Effect.gen(function* () {
      const recovered = yield* localPromise(() => createJobStore(root));
      yield* localPromise(() => recovered.close());
    }).pipe(
      Effect.provide(
        createLoggerLayer({
          minimumLevel: "warn",
          human: { write: (_line, record) => records.push(record) },
          json: false,
        }),
      ),
    );
    expect(records.some((record) => record.message.includes("Recovered local journal"))).toBe(true);
    expect(JSON.stringify(records)).not.toContain("secret-malformed-payload");
    expect(JSON.stringify(records)).not.toContain(root);
  }).pipe(Effect.scoped),
);

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

it("Promise store acquisition and finalization keep the default console quiet", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const root = await mkdtemp(join(tmpdir(), "relkit-quiet-close-"));
  try {
    const store = await createJobStore(root);
    await store.close();
    expect(output).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  } finally {
    output.mockRestore();
    error.mockRestore();
    await rm(root, { force: true, recursive: true });
  }
});

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
    const release = yield* Deferred.make<unknown>();
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
    const release = yield* Deferred.make<unknown>();
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

it.effect("transaction defects release the filesystem lock and remain defects", () =>
  Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      localPromise(() => mkdtemp(join(tmpdir(), "relkit-effect-state-"))),
      (path) => localPromise(() => rm(path, { force: true, recursive: true })).pipe(Effect.orDie),
    );
    const store = yield* makeAgentStateStore(root);
    yield* store.read();
    const bug = new Error("programming defect");
    const exit = yield* Effect.exit(
      store.update(() => {
        throw bug;
      }),
    );
    expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
    expect(yield* localPromise(() => readdir(root))).toEqual(["agent-state.json"]);
    expect(yield* store.update((state) => [{ ...state, revision: 1 }, 1])).toBe(1);
  }).pipe(Effect.scoped),
);

it.effect("native compatibility hops preserve configured sinks, levels and metrics", () =>
  Effect.gen(function* () {
    const records: LogRecord[] = [];
    const logger = createLoggerLayer({
      minimumLevel: "info",
      human: { write: (_line, record) => records.push(record) },
      json: false,
    });
    yield* Effect.gen(function* () {
      const error = new TypeError("expected boundary failure");
      expect(
        yield* localPromise(() =>
          runLocal(localOperation("Test.nativeRoundTrip", Effect.succeed(42))),
        ),
      ).toBe(42);
      yield* Effect.result(
        localPromise(() =>
          runLocal(
            localOperation(
              "Test.nativeFailure",
              localSync(() => {
                throw error;
              }),
            ),
          ),
        ),
      );
      const child = yield* Effect.forkChild(
        localPromise(() => runLocal(Effect.logDebug("child diagnostic"))).pipe(
          Effect.provideService(References.MinimumLogLevel, "Debug"),
        ),
      );
      yield* Fiber.join(child);
      yield* localPromise(() => runLocal(Effect.logDebug("parent hidden")));
      const metric = Metric.withAttributes(
        Metric.counter("relkit_execution_operations_total", { incremental: true }),
        { domain: "local", operation: "Test.nativeRoundTrip" },
      );
      expect((yield* Metric.value(metric)).count).toBe(1);
    }).pipe(
      Effect.provide(logger),
      Effect.provideService(Metric.MetricRegistry, new Map()),
      Effect.annotateLogs({ requestId: "request", token: "secret" }),
    );
    expect(records.map((record) => record.fields.outcome).filter(Boolean)).toEqual([
      "success",
      "failure",
    ]);
    expect(records.some((record) => record.message === "child diagnostic")).toBe(true);
    expect(records.some((record) => record.message === "parent hidden")).toBe(false);
    expect(JSON.stringify(records)).not.toContain("secret");
  }),
);

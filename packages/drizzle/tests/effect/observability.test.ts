import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Logger, Metric, References } from "effect";
import { observeSpecializedOperation } from "../../src/operation-tracing.js";
import { activateDrizzleService } from "../../src/activation.js";
import { defineDrizzleService } from "../../src/service.js";
import { records } from "./fixtures.js";

it.effect("standalone outcomes retain causes and redact results with bounded metrics", () =>
  Effect.gen(function* () {
    const registry: Metric.MetricRegistry = new Map();
    const logs: unknown[] = [];
    const logger = Logger.make((options) =>
      logs.push({
        message: options.message,
        level: options.logLevel,
        annotations: options.fiber.getRef(References.CurrentLogAnnotations),
      }),
    );
    const ready = yield* Deferred.make<void>();
    const defect = new Error("secret-row-password");
    const effect = Effect.gen(function* () {
      expect(
        yield* observeSpecializedOperation(
          "database.findOne",
          Effect.succeed({ password: "secret-row-password" }),
        ),
      ).toEqual({ password: "secret-row-password" });
      const failure = yield* Effect.exit(
        observeSpecializedOperation("database.insert", Effect.fail(defect)),
      );
      expect(Exit.isFailure(failure) && Cause.squash(failure.cause)).toBe(defect);
      const died = yield* Effect.exit(
        observeSpecializedOperation("database.update", Effect.die(defect)),
      );
      expect(Exit.isFailure(died) && Cause.hasDies(died.cause)).toBe(true);
      const fiber = yield* Effect.forkChild(
        observeSpecializedOperation(
          "database.custom-secret-row-password",
          Effect.andThen(Deferred.succeed(ready, undefined), Effect.never),
        ),
      );
      yield* Deferred.await(ready);
      yield* Fiber.interrupt(fiber);
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(Metric.MetricRegistry, registry),
      Effect.provideService(References.MinimumLogLevel, "Debug"),
    );
    yield* effect;
    const metadata = [...registry.values()];
    expect(metadata.filter((item) => item.id === "relkit_execution_operations_total")).toHaveLength(
      4,
    );
    const outcomes = metadata
      .filter((item) => item.id === "relkit_execution_outcomes_total")
      .map((item) => item.attributes?.outcome);
    expect(outcomes).toEqual(
      expect.arrayContaining(["success", "failure", "defect", "interrupted"]),
    );
    expect(metadata.filter((item) => item.id === "relkit_execution_duration_ms")).toHaveLength(4);
    expect(metadata.filter((item) => item.id === "relkit_execution_workload_total")).toHaveLength(
      4,
    );
    expect(JSON.stringify({ logs, metadata })).not.toContain("secret-row-password");
    expect(logs).toHaveLength(4);
  }),
);

it.effect("Promise lifecycle and CRUD inherit explicit configured sinks once", () =>
  Effect.gen(function* () {
    const registry: Metric.MetricRegistry = new Map();
    const logs: unknown[] = [];
    const logger = Logger.make((options) => logs.push(options.message));
    const instrumentation = Context.empty().pipe(
      Context.add(References.CurrentLoggers, new Set([logger])),
      Context.add(References.MinimumLogLevel, "Info"),
      Context.add(Metric.MetricRegistry, registry),
    );
    const builder = {
      from() {
        return this;
      },
      limit() {
        return this;
      },
      offset() {
        return Promise.resolve([{ id: 1 }]);
      },
    };
    const active = yield* Effect.promise(() =>
      activateDrizzleService(
        defineDrizzleService({ schema: { records }, client: () => ({ select: () => builder }) }),
        {},
        { instrumentation },
      ),
    );
    expect(yield* Effect.promise(() => active.context.records.findMany())).toEqual([{ id: 1 }]);
    yield* Effect.promise(() => active.close());
    expect(logs).toHaveLength(3);
    const counts = [...registry.values()].filter(
      (item) => item.id === "relkit_execution_operations_total",
    );
    expect(counts.map((item) => item.attributes?.operation)).toEqual(
      expect.arrayContaining(["database.acquire", "database.close", "database.findMany"]),
    );
    for (const counter of counts) expect(counter.hooks.get(Context.empty()).count).toBe(1);
  }),
);

it.effect("child logger threshold changes stay local while annotations inherit", () =>
  Effect.gen(function* () {
    const messages: unknown[] = [];
    const logger = Logger.make((options) =>
      messages.push({
        message: options.message,
        annotations: options.fiber.getRef(References.CurrentLogAnnotations),
      }),
    );
    yield* Effect.gen(function* () {
      const child = yield* Effect.forkChild(
        observeSpecializedOperation("database.extension", Effect.void).pipe(
          Effect.provideService(References.MinimumLogLevel, "Error"),
        ),
      );
      yield* Fiber.join(child);
      yield* observeSpecializedOperation("database.findMany", Effect.void);
      expect(yield* Effect.service(References.MinimumLogLevel)).toBe("Info");
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Info"),
      Effect.annotateLogs({ request: "safe-correlation" }),
    );
    expect(messages).toHaveLength(1);
    expect(JSON.stringify(messages)).toContain("safe-correlation");
  }),
);

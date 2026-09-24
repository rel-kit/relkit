import { describe, expect, test } from "vitest";
import { Effect, Layer, Metric, Tracer } from "effect";
import {
  ConfigTelemetry,
  ConfigTelemetryLive,
  defineEnvEffect,
  env,
  resolveEnvEffect,
} from "../src/index.js";
import type { ConfigOperation } from "../src/index.js";

describe("config telemetry", () => {
  test("accepts a deterministic observer Layer", () => {
    const seen: ConfigOperation[] = [];
    const telemetry = Layer.succeed(ConfigTelemetry, {
      observe: <A, E, R>(operation: ConfigOperation, effect: Effect.Effect<A, E, R>) => {
        seen.push(operation);
        return effect;
      },
    });
    const definition = Effect.runSync(
      Effect.provide(defineEnvEffect({ MODE: env.string() }), telemetry),
    );
    expect(definition.MODE.name).toBe("MODE");
    expect(seen).toEqual(["define", "create-ref"]);
    const missing = Effect.runSync(
      Effect.provide(
        Effect.catchTag(
          resolveEnvEffect(definition, { environment: "test", source: {} }),
          "EnvResolutionError",
          (error) => Effect.succeed(error._tag),
        ),
        telemetry,
      ),
    );
    expect(missing).toBe("EnvResolutionError");
    expect(seen.at(-1)).toBe("resolve");
  });

  test("records success and failure metrics with bounded labels", () => {
    const operation = "resolve";
    const calls = Metric.withAttributes(
      Metric.counter("relkit_config_operations_total", { incremental: true }),
      { operation },
    );
    const failures = Metric.withAttributes(
      Metric.counter("relkit_config_failures_total", { incremental: true }),
      { operation },
    );
    const duration = Metric.withAttributes(
      Metric.histogram("relkit_config_duration_ms", {
        boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
      }),
      { operation },
    );
    const count = () =>
      Effect.runSync(
        Effect.gen(function* () {
          return {
            calls: (yield* Metric.value(calls)).count,
            failures: (yield* Metric.value(failures)).count,
            duration: (yield* Metric.value(duration)).count,
          };
        }),
      );
    const before = count();
    const definition = Effect.runSync(defineEnvEffect({ MODE: env.string() }));
    Effect.runSync(
      Effect.provide(
        resolveEnvEffect(definition, {
          environment: "test",
          source: { MODE: "ready" },
        }),
        ConfigTelemetryLive,
      ),
    );
    Effect.runSync(
      Effect.provide(
        Effect.catchTag(
          resolveEnvEffect(definition, {
            environment: "test",
            source: {},
          }),
          "EnvResolutionError",
          () => Effect.void,
        ),
        ConfigTelemetryLive,
      ),
    );
    const after = count();
    expect(after.calls - before.calls).toBe(2);
    expect(after.failures - before.failures).toBe(1);
    expect(after.duration - before.duration).toBe(2);
  });

  test("emits stable spans for successful and failed operations", () => {
    const names: string[] = [];
    const tracer = Tracer.make({
      span(options) {
        names.push(options.name);
        return Tracer.nativeTracer.span(options);
      },
    });
    const definition = Effect.runSync(defineEnvEffect({ MODE: env.string() }));
    Effect.runSync(
      Effect.withTracer(
        resolveEnvEffect(definition, {
          environment: "test",
          source: { MODE: "ready" },
        }),
        tracer,
      ),
    );
    Effect.runSync(
      Effect.withTracer(
        Effect.catchTag(
          resolveEnvEffect(definition, {
            environment: "test",
            source: {},
          }),
          "EnvResolutionError",
          () => Effect.void,
        ),
        tracer,
      ),
    );
    expect(names).toEqual(["config.resolve", "config.resolve"]);
  });
});

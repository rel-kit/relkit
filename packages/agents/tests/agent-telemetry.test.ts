import { Effect, Layer, Metric } from "effect";
import { expect, test } from "vitest";
import { AgentTelemetry, AgentTelemetryLive } from "../src/agent-telemetry.js";
import { createAgentCapturePolicyEffect } from "../src/capture-policy.js";

test("live telemetry records calls, failures, and durations", () => {
  const registry: Metric.MetricRegistry = new Map();
  const attributes = { operation: "capture.policy" };
  const calls = Metric.withAttributes(
    Metric.counter("relkit_agent_operations_total", { incremental: true }),
    attributes,
  );
  const failures = Metric.withAttributes(
    Metric.counter("relkit_agent_failures_total", { incremental: true }),
    attributes,
  );
  const duration = Metric.withAttributes(
    Metric.histogram("relkit_agent_duration_ms", {
      boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
    }),
    attributes,
  );
  const program = Effect.gen(function* () {
    yield* createAgentCapturePolicyEffect({ mode: "off" });
    yield* Effect.flip(createAgentCapturePolicyEffect({ mode: "development-redacted" }));
    return {
      calls: (yield* Metric.value(calls)).count,
      failures: (yield* Metric.value(failures)).count,
      duration: (yield* Metric.value(duration)).count,
    };
  });

  expect(
    Effect.runSync(
      Effect.provideService(
        Effect.provide(program, AgentTelemetryLive),
        Metric.MetricRegistry,
        registry,
      ),
    ),
  ).toEqual({ calls: 2, failures: 1, duration: 2 });
});

test("a test Layer replaces telemetry for both success and failure", () => {
  const observed: string[] = [];
  const layer = Layer.succeed(AgentTelemetry, {
    observe: (operation, effect) =>
      Effect.ensuring(
        effect,
        Effect.sync(() => {
          observed.push(operation);
        }),
      ),
  });
  const program = Effect.gen(function* () {
    yield* createAgentCapturePolicyEffect({ mode: "off" });
    yield* Effect.flip(createAgentCapturePolicyEffect({ mode: "development-redacted" }));
  });

  Effect.runSync(Effect.provide(program, layer));
  expect(observed).toEqual(["capture.policy", "capture.policy"]);
});

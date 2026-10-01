import { expect, test } from "vitest";
import { Effect, Layer, Metric, Tracer } from "effect";
import { graph } from "./fixtures/generator-graphs.js";
import { clientRoutes, clientRoutesEffect } from "../src/generate-types.js";
import { schemaTypeEffect } from "../src/generate-schema.js";
import { publicManifestEffect } from "../src/generate-public-manifest.js";
import { GeneratorTelemetry } from "../src/generator-observability.js";
import { agentProcedureEntriesFromDocumentEffect } from "../src/generate-agent-procedures.js";
test("records calls, failures, and durations in an isolated MetricRegistry", () => {
  const base = graph(false);
  const broken = { ...base, nodes: base.nodes.filter((node) => node.kind !== "function") };
  const registry: Metric.MetricRegistry = new Map();
  const attributes = { operation: "clientRoutes" };
  const calls = Metric.withAttributes(
    Metric.counter("relkit_client_generator_operations_total", { incremental: true }),
    attributes,
  );
  const failures = Metric.withAttributes(
    Metric.counter("relkit_client_generator_failures_total", { incremental: true }),
    attributes,
  );
  const duration = Metric.withAttributes(
    Metric.histogram("relkit_client_generator_duration_ms", {
      boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
    }),
    attributes,
  );
  const result = Effect.runSync(
    Effect.provideService(
      Effect.gen(function* () {
        yield* clientRoutesEffect(base);
        yield* Effect.exit(clientRoutesEffect(broken));
        return {
          calls: (yield* Metric.value(calls)).count,
          failures: (yield* Metric.value(failures)).count,
          duration: (yield* Metric.value(duration)).count,
        };
      }),
      Metric.MetricRegistry,
      registry,
    ),
  );
  expect(result).toEqual({ calls: 2, failures: 1, duration: 2 });
});
test("creates one span for each named Effect operation", () => {
  const names: string[] = [];
  const tracer = Tracer.make({
    span(options) {
      names.push(options.name);
      return new Tracer.NativeSpan(options);
    },
  });
  expect(Effect.runSync(Effect.withTracer(schemaTypeEffect({ type: "string" }), tracer))).toBe(
    "string",
  );
  expect(names).toEqual(["clientGenerator.schemaType"]);
});
test("synchronous adapters record success and failure metrics", () => {
  const base = graph(false);
  const broken = { ...base, nodes: base.nodes.filter((node) => node.kind !== "function") };
  const attributes = { operation: "clientRoutes" };
  const calls = Metric.withAttributes(
    Metric.counter("relkit_client_generator_operations_total", { incremental: true }),
    attributes,
  );
  const failures = Metric.withAttributes(
    Metric.counter("relkit_client_generator_failures_total", { incremental: true }),
    attributes,
  );
  const duration = Metric.withAttributes(
    Metric.histogram("relkit_client_generator_duration_ms", {
      boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
    }),
    attributes,
  );
  const before = Effect.runSync(
    Effect.all({
      calls: Metric.value(calls),
      failures: Metric.value(failures),
      duration: Metric.value(duration),
    }),
  );
  expect(clientRoutes(base)).toHaveLength(1);
  expect(() => clientRoutes(broken)).toThrow(TypeError);
  const after = Effect.runSync(
    Effect.all({
      calls: Metric.value(calls),
      failures: Metric.value(failures),
      duration: Metric.value(duration),
    }),
  );
  expect(after.calls.count - before.calls.count).toBe(2);
  expect(after.failures.count - before.failures.count).toBe(1);
  expect(after.duration.count - before.duration.count).toBe(2);
});
test("composed calculations stay in the supplied Effect runtime", () => {
  const registry: Metric.MetricRegistry = new Map();
  const jobCalls = Metric.withAttributes(
    Metric.counter("relkit_client_generator_operations_total", { incremental: true }),
    { operation: "jobProcedureSources" },
  );
  const before = Effect.runSync(Metric.value(jobCalls)).count;
  const observed: string[] = [];
  const result = Effect.runSync(
    Effect.provideService(
      Effect.provideService(publicManifestEffect(graph(false)), Metric.MetricRegistry, registry),
      GeneratorTelemetry,
      {
        observe(operation, effect) {
          observed.push(operation);
          return effect;
        },
      },
    ),
  );
  expect(result).toMatchObject({ protocol: "relkit.client-manifest" });
  expect(observed).toEqual(["publicManifest", "clientRoutes"]);
  expect(Effect.runSync(Metric.value(jobCalls)).count).toBe(before);
});
test("agent resume rendering composes inside the supplied telemetry Layer", () => {
  const observed: string[] = [];
  const telemetry = Layer.succeed(GeneratorTelemetry, {
    observe(operation, effect) {
      observed.push(operation);
      return effect;
    },
  });
  const entries = Effect.runSync(
    Effect.provide(
      agentProcedureEntriesFromDocumentEffect([
        {
          id: "assistant",
          input: { type: "string" },
          workflow: { nodes: [{ resume: { type: "boolean" } }] },
        },
      ]),
      telemetry,
    ),
  );
  expect(entries.join("\n")).toContain("readonly resume: true");
  expect(observed).toEqual(["agentProcedureEntriesFromDocument"]);
});

import { describe, expect, it } from "vitest";
import { Effect, Layer, Metric, Tracer } from "effect";
import {
  createDiagnostic,
  createDiagnosticEffect,
  DiagnosticTelemetry,
  DiagnosticTelemetryLive,
  DiagnosticSource,
  formatDiagnosticEffect,
} from "../src/index.js";
import type { DiagnosticOperation } from "../src/index.js";

const input = { code: "X", severity: "info", message: "Note" } as const;

describe("diagnostic telemetry", () => {
  it("uses a substitute Layer and preserves typed failures", () => {
    const seen: DiagnosticOperation[] = [];
    const telemetry = Layer.succeed(DiagnosticTelemetry, {
      observe: <A, E, R>(operation: DiagnosticOperation, effect: Effect.Effect<A, E, R>) => {
        seen.push(operation);
        return effect;
      },
    });
    const result = Effect.runSync(
      Effect.provide(
        Effect.catchTag(
          formatDiagnosticEffect({ ...input, code: "" }),
          "DiagnosticValidationError",
          (error) => Effect.succeed(error._tag),
        ),
        telemetry,
      ),
    );
    expect(result).toBe("DiagnosticValidationError");
    expect(seen).toEqual(["format-one", "create"]);
  });

  it("records bounded call, failure, and duration metrics", () => {
    const operation = "create";
    const calls = Metric.withAttributes(
      Metric.counter("relkit_diagnostic_operations_total", { incremental: true }),
      { operation },
    );
    const failures = Metric.withAttributes(
      Metric.counter("relkit_diagnostic_failures_total", { incremental: true }),
      { operation },
    );
    const duration = Metric.withAttributes(
      Metric.histogram("relkit_diagnostic_duration_ms", {
        boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
      }),
      { operation },
    );
    const before = Effect.runSync(
      Effect.gen(function* () {
        return {
          calls: (yield* Metric.value(calls)).count,
          failures: (yield* Metric.value(failures)).count,
          duration: (yield* Metric.value(duration)).count,
        };
      }),
    );
    Effect.runSync(Effect.provide(createDiagnosticEffect(input), DiagnosticTelemetryLive));
    Effect.runSync(
      Effect.provide(
        Effect.catchTag(
          createDiagnosticEffect({ ...input, code: "" }),
          "DiagnosticValidationError",
          () => Effect.void,
        ),
        DiagnosticTelemetryLive,
      ),
    );
    const after = Effect.runSync(
      Effect.gen(function* () {
        return {
          calls: (yield* Metric.value(calls)).count,
          failures: (yield* Metric.value(failures)).count,
          duration: (yield* Metric.value(duration)).count,
        };
      }),
    );
    expect(after.calls - before.calls).toBe(2);
    expect(after.failures - before.failures).toBe(1);
    expect(after.duration - before.duration).toBe(2);
    expect(createDiagnostic(input).code).toBe("X");
  });

  it("creates stable spans for success and failure", () => {
    const names: string[] = [];
    const tracer = Tracer.make({
      span(options) {
        names.push(options.name);
        return Tracer.nativeTracer.span(options);
      },
    });
    Effect.runSync(Effect.withTracer(createDiagnosticEffect(input), tracer));
    Effect.runSync(
      Effect.withTracer(
        Effect.catchTag(
          createDiagnosticEffect({ ...input, code: "" }),
          "DiagnosticValidationError",
          () => Effect.void,
        ),
        tracer,
      ),
    );
    expect(names).toEqual(["diagnostics.create", "diagnostics.create"]);
  });

  it("counts source provider failures for the formatting operation", () => {
    const operation = "format-one";
    const failures = Metric.withAttributes(
      Metric.counter("relkit_diagnostic_failures_total", { incremental: true }),
      { operation },
    );
    const before = Effect.runSync(Metric.value(failures)).count;
    const source = Layer.succeed(DiagnosticSource, {
      read: () => {
        throw new Error("source unavailable");
      },
    });
    Effect.runSync(
      Effect.catchTag(
        Effect.provide(
          formatDiagnosticEffect({
            ...input,
            file: "src/a.ts",
            line: 1,
            column: 1,
          }),
          source,
        ),
        "DiagnosticSourceError",
        () => Effect.void,
      ),
    );
    expect(Effect.runSync(Metric.value(failures)).count - before).toBe(1);
  });
});

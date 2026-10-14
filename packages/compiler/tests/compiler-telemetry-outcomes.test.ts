/** Verifies compiler telemetry preserves caller logs, span lifetimes and all four terminal channels in isolated native metric registries. */
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Logger, Metric, References, Tracer } from "effect";
import { TestClock } from "effect/testing";
import { observeCompiler } from "../src/observability.js";
import { observeJobs } from "../src/jobs/observability.js";

/**
 * Requires exactly one operation outcome for a supplied native metric contract.
 * @param name - Native counter name used by the compiler or jobs observer.
 * @param attributes - Exact fixed operation/outcome dimensions.
 * @returns Completion after asserting the isolated native metric value.
 */
const assertOutcome = Effect.fn("CompilerTelemetry.assertOutcome")(function* (
  name: string,
  attributes: Readonly<Record<string, string>>,
) {
  const counter = Metric.withAttributes(Metric.counter(name, { incremental: true }), attributes);
  expect((yield* Metric.value(counter)).count).toBe(1);
});

/**
 * Exercises success, typed failure, defect and interruption without changing their authoritative values.
 * @returns Completion after native compiler and job outcome counters have been checked.
 */
const observeOutcomes = Effect.fn("CompilerTelemetry.outcomes")(function* () {
  for (const [outcome, body] of [
    ["success", TestClock.adjust("25 millis")],
    ["failure", Effect.fail("expected")],
    ["defect", Effect.die("bug")],
    ["interrupted", Effect.interrupt],
  ] as const) {
    const exit = yield* Effect.exit(
      observeCompiler("configuration", "loadConfig", body).pipe(
        Effect.withSpan("probe." + outcome),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(outcome === "success");
    if (Exit.isFailure(exit) && outcome === "failure")
      expect(Cause.squash(exit.cause)).toBe("expected");
    if (Exit.isFailure(exit) && outcome === "defect") expect(Cause.squash(exit.cause)).toBe("bug");
    if (Exit.isFailure(exit) && outcome === "interrupted")
      expect(Cause.hasInterrupts(exit.cause)).toBe(true);
    yield* assertOutcome("relkit_compiler_outcomes_total", {
      stage: "configuration",
      operation: "loadConfig",
      outcome,
    });
    yield* Effect.exit(observeJobs("renderWorker", body));
    yield* assertOutcome("relkit_compiler_jobs_outcomes_total", {
      operation: "renderWorker",
      outcome,
    });
  }
});

it.effect("captures caller spans/logs and terminal channels in an isolated registry", () =>
  Effect.gen(function* () {
    const spans: Tracer.NativeSpan[] = [];
    const logs: string[] = [];
    const tracer = Tracer.make({
      /** Records the actual span returned to the compiler's scoped observer.
       * @param options - Native parent, timing and attribute options.
       * @returns A native span whose real ending is asserted after the operation settles. */
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    yield* observeOutcomes().pipe(
      Effect.provideService(Tracer.Tracer, tracer),
      Effect.provideService(References.MinimumLogLevel, "Debug"),
      Effect.provide(Logger.layer([Logger.make((options) => logs.push(String(options.message)))])),
    );
    const duration = yield* Metric.value(
      Metric.withAttributes(
        Metric.histogram("relkit_compiler_duration_ms", {
          boundaries: [0.01, 0.1, 1, 5, 10, 50, 100, 1000],
        }),
        { stage: "configuration", operation: "loadConfig" },
      ),
    );
    expect(duration.count).toBe(4);
    expect(duration.sum).toBe(25);
    expect(
      spans.flatMap((span) => {
        const outcome = span.attributes.get("compiler.outcome");
        return outcome === undefined ? [] : [outcome];
      }),
    ).toEqual(["success", "failure", "defect", "interrupted"]);
    expect(spans.every((span) => span.status._tag === "Ended")).toBe(true);
    expect(logs).toHaveLength(8);
  }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
);

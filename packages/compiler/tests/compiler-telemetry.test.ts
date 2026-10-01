import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Logger, Metric, References, Tracer } from "effect";
import { TestClock } from "effect/testing";
import { observeCompiler } from "../src/observability.js";
import { observeJobs } from "../src/jobs/observability.js";
import { loadPackageEffect } from "../src/integration-package-loader.js";
import { CompilerPackageSource } from "../src/integration-package-source.js";
import { generateEventRegistryEffect } from "../src/event-registry.js";
import { renderRoutingEffect, renderWorkerEffect } from "../src/jobs/worker-routing.js";
import { acquireEvaluatorDetectors } from "../src/discovery/evaluator-detectors.js";
import { createEvaluatorRequestEffect } from "../src/discovery/evaluator-request.js";
import { normalizeCompilationEffect } from "../src/normalize.js";

describe("caller compiler telemetry", () => {
  it.effect("captures caller spans/logs and terminal channels in an isolated registry", () =>
    Effect.gen(function* () {
      const spans: Tracer.NativeSpan[] = [];
      const logs: unknown[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const program = Effect.gen(function* () {
        for (const [outcome, body] of [
          ["success", TestClock.adjust("25 millis")],
          ["failure", Effect.fail("expected")],
          ["defect", Effect.die("bug")],
          ["interrupted", Effect.interrupt],
        ] as const) {
          const exit = yield* Effect.exit(
            observeCompiler("configuration", "loadConfig", body).pipe(
              Effect.withSpan(`probe.${outcome}`),
            ),
          );
          expect(Exit.isSuccess(exit)).toBe(outcome === "success");
          if (Exit.isFailure(exit) && outcome === "failure")
            expect(Cause.squash(exit.cause)).toBe("expected");
          if (Exit.isFailure(exit) && outcome === "defect")
            expect(Cause.squash(exit.cause)).toBe("bug");
          if (Exit.isFailure(exit) && outcome === "interrupted")
            expect(Cause.hasInterrupts(exit.cause)).toBe(true);
          const metric = Metric.withAttributes(
            Metric.counter("relkit_compiler_outcomes_total", { incremental: true }),
            { stage: "configuration", operation: "loadConfig", outcome },
          );
          expect((yield* Metric.value(metric)).count).toBe(1);
          yield* Effect.exit(observeJobs("renderWorker", body));
          expect(
            (yield* Metric.value(
              Metric.withAttributes(
                Metric.counter("relkit_compiler_jobs_outcomes_total", { incremental: true }),
                { operation: "renderWorker", outcome },
              ),
            )).count,
          ).toBe(1);
        }
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
      });
      yield* program.pipe(
        Effect.provideService(Tracer.Tracer, tracer),
        Effect.provideService(References.MinimumLogLevel, "Debug"),
        Effect.provide(Logger.layer([Logger.make((options) => logs.push(options.message))])),
      );
      expect(spans.map((span) => span.attributes.get("compiler.outcome"))).toEqual([
        "success",
        "failure",
        "defect",
        "interrupted",
      ]);
      expect(spans.every((span) => span.status._tag === "Ended")).toBe(true);
      expect(logs).toHaveLength(8);
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
  );

  it.effect("defers workload getters and counts standalone package and render operations", () =>
    Effect.gen(function* () {
      let reads = 0;
      const operation = generateEventRegistryEffect([], {
        get projectRoot() {
          reads++;
          return "/project";
        },
      });
      expect(reads).toBe(0);
      yield* operation;
      expect(reads).toBe(1);
      const defect = new Error("workload getter bug");
      const broken = observeCompiler("generation", "generateManifest", Effect.void, () => {
        throw defect;
      });
      const exit = yield* Effect.exit(broken);
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe(defect);
      yield* loadPackageEffect("example", "/project").pipe(
        Effect.provideService(CompilerPackageSource, {
          resolve: () => Effect.succeed("/package/index.ts"),
          canonical: (path) => Effect.succeed(path),
          exists: () => Effect.succeed(true),
          readManifest: () => Effect.succeed({ name: "example" }),
        }),
      );
      for (const operation of ["loadPackage", "packageName"]) {
        expect(
          (yield* Metric.value(
            Metric.withAttributes(
              Metric.counter("relkit_compiler_operations_total", { incremental: true }),
              { stage: "configuration", operation },
            ),
          )).count,
        ).toBe(1);
      }
      const entry = {
        taskId: "send",
        jobId: "send",
        buildId: "build",
        serviceGeneration: "v1",
        path: "worker.json",
      };
      const worker = yield* renderWorkerEffect(entry, []);
      const routing = yield* renderRoutingEffect(entry, []);
      for (const [operation, content] of [
        ["renderWorker", worker],
        ["renderRouting", routing],
      ] as const) {
        expect(
          (yield* Metric.value(
            Metric.withAttributes(
              Metric.counter("relkit_compiler_jobs_operations_total", { incremental: true }),
              { operation },
            ),
          )).count,
        ).toBe(1);
        expect(
          (yield* Metric.value(
            Metric.withAttributes(
              Metric.counter("relkit_compiler_jobs_workload_total", { incremental: true }),
              { operation, kind: "bytes" },
            ),
          )).count,
        ).toBe(Buffer.byteLength(content ?? "", "utf8"));
      }
      const normalized = yield* normalizeCompilationEffect({
        projectRoot: "/project",
        sources: [{ fileName: "src/orders/service.ts", text: "export default defineService({});" }],
      });
      expect(
        (yield* Metric.value(
          Metric.withAttributes(
            Metric.counter("relkit_compiler_operations_total", { incremental: true }),
            { stage: "discovery", operation: "readFacts" },
          ),
        )).count,
      ).toBe(1);
      expect(
        (yield* Metric.value(
          Metric.withAttributes(
            Metric.counter("relkit_compiler_workload_total", { incremental: true }),
            { stage: "generation", operation: "makeOutputs", kind: "bytes" },
          ),
        )).count,
      ).toBe(
        Object.values(normalized.outputs).reduce(
          (bytes, source) => bytes + Buffer.byteLength(source, "utf8"),
          0,
        ),
      );
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
  );

  it.effect("keeps compiler telemetry out of candidate output while hooks own the streams", () =>
    Effect.gen(function* () {
      let logs = 0;
      const report = yield* Effect.scoped(
        Effect.gen(function* () {
          const session = yield* acquireEvaluatorDetectors({
            projectRoot: process.cwd(),
            generatedDirectory: ".relkit/generated",
            networkAllowlist: [],
          });
          yield* createEvaluatorRequestEffect({
            projectRoot: process.cwd(),
            candidates: [],
            generationId: "telemetry-clean",
          });
          return yield* session.finishEffect();
        }),
      ).pipe(
        Effect.provideService(References.MinimumLogLevel, "Debug"),
        Effect.provide(
          Logger.layer([
            Logger.make(() => {
              logs++;
              process.stdout.write("compiler telemetry leak");
            }),
          ]),
        ),
      );
      expect(report).toEqual({ stdout: "", stderr: "", sideEffects: [] });
      expect(logs).toBe(0);
    }),
  );
});

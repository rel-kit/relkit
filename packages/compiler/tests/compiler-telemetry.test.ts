/** Verifies lazy workload getters and exact standalone compiler package/render operation counts in isolated metric registries. */
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Metric } from "effect";

import { observeCompiler } from "../src/observability.js";

import { loadPackageEffect } from "../src/integration-package-loader.js";
import { CompilerPackageSource } from "../src/integration-package-source.js";
import { generateEventRegistryEffect } from "../src/event-registry.js";
import { renderRoutingEffect, renderWorkerEffect } from "../src/jobs/worker-routing.js";

import { normalizeCompilationEffect } from "../src/normalize.js";

it.effect("defers workload getters and preserves getter defects", () =>
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
  }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
);

it.effect("counts standalone native package loading", () =>
  Effect.gen(function* () {
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
  }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
);

it.effect("counts standalone worker and routing rendering", () =>
  Effect.gen(function* () {
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
  }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
);

it.effect("counts source facts for extraction and layout analysis separately", () =>
  Effect.gen(function* () {
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
    ).toBe(2);
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

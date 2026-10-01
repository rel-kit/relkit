import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Metric } from "effect";
import { TestClock } from "effect/testing";
import { loadConfigEffect, validateConfigEffect } from "../src/config-loader.js";
import { parseRouteFilePathEffect } from "../src/route-file.js";
import {
  CompilerPackageSource,
  resolveRuntimeIntegrationPackagesEffect,
} from "../src/integration-package-resolution.js";
import { observeCompiler } from "../src/observability.js";
import { normalizeCompilationEffect } from "../src/normalize.js";
import { writeGeneratedArtifactsEffect } from "../src/generated-artifacts.js";
import { EMPTY_OUTPUTS } from "../src/normalize-types.js";

describe("compiler Effect contracts", () => {
  it.effect("preserves extension accessor defects before publication", () =>
    Effect.gen(function* () {
      const defect = new Error("extension getter bug");
      const exit = yield* Effect.exit(
        writeGeneratedArtifactsEffect(EMPTY_OUTPUTS, {
          directory: "/unused",
          extensions: [
            {
              kind: "openapi",
              version: 1,
              get content(): string {
                throw defect;
              },
            },
          ],
        }),
      );
      expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe(defect);
    }),
  );

  it.effect("retains configuration and route rejections in the typed failure channel", () =>
    Effect.gen(function* () {
      const issues = yield* validateConfigEffect({}, { projectRoot: "relative" });
      expect(issues[0]?.code).toBe("RELKIT_CONFIG_ROOT_INVALID");
      const config = yield* Effect.flip(loadConfigEffect({ unknown: true }, "/tmp/project"));
      expect(config._tag).toBe("CompilerConfigError");
      expect(config.cause).toMatchObject({ name: "ConfigValidationError" });
      const route = yield* Effect.flip(parseRouteFilePathEffect("src/flat.route.ts"));
      expect(route._tag).toBe("RouteFileError");
      expect(route.cause).toBeInstanceOf(TypeError);
    }),
  );

  it.effect(
    "resolves package metadata through an injected source and preserves source defects",
    () =>
      Effect.gen(function* () {
        let reads = 0;
        const source = CompilerPackageSource.of({
          resolve: () => Effect.succeed("/tmp/project/node_modules/example/index.ts"),
          canonical: (path) => Effect.succeed(path),
          exists: () => Effect.succeed(true),
          readManifest: () =>
            Effect.sync(() => {
              reads++;
              return { name: "example", version: "1.0.0" };
            }),
        });
        const operation = resolveRuntimeIntegrationPackagesEffect({
          projectRoot: "/tmp/project",
          imports: ["example", "example"],
        });
        expect(reads).toBe(0);
        expect(yield* operation.pipe(Effect.provideService(CompilerPackageSource, source))).toEqual(
          [],
        );
        expect(reads).toBe(1);
        const defect = new Error("source bug");
        const exit = yield* operation.pipe(
          Effect.provideService(CompilerPackageSource, {
            ...source,
            readManifest: () => Effect.die(defect),
          }),
          Effect.exit,
        );
        expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe(defect);
      }),
  );

  it.effect("counts standalone and composed operations once with deterministic duration", () =>
    Effect.gen(function* () {
      yield* normalizeCompilationEffect();
      const calls = Metric.counter("relkit_compiler_operations_total", { incremental: true });
      expect(
        (yield* Metric.value(
          Metric.withAttributes(calls, {
            stage: "normalization",
            operation: "normalizeCompilation",
          }),
        )).count,
      ).toBe(1);
      expect(
        (yield* Metric.value(
          Metric.withAttributes(calls, { stage: "normalization", operation: "passExtract" }),
        )).count,
      ).toBe(1);
      yield* observeCompiler(
        "normalization",
        "schema",
        TestClock.adjust("25 millis").pipe(Effect.as("done")),
      );
      const duration = Metric.histogram("relkit_compiler_duration_ms", {
        boundaries: [0.01, 0.1, 1, 5, 10, 50, 100, 1000],
      });
      const value = yield* Metric.value(
        Metric.withAttributes(duration, { stage: "normalization", operation: "schema" }),
      );
      expect(value.count).toBe(1);
      expect(value.sum).toBe(25);
      const interrupted = yield* Effect.exit(
        observeCompiler("normalization", "schema", Effect.interrupt),
      );
      expect(Exit.isFailure(interrupted) && Cause.hasInterrupts(interrupted.cause)).toBe(true);
    }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
  );
});

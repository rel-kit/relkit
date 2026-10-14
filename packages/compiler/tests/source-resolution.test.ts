/**
 * Exercises the resolver's real TypeScript configuration acquisition and its
 * substitutable Layer seam. Virtual source modules never execute; temporary
 * config files are released after success, typed failure and interruption.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Exit, Metric } from "effect";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { SourceResolution, sourceResolutionLayer } from "../src/source-resolution.service.js";
import { sourceResolutionOptionsEffect } from "../src/source-resolution-options.js";
import * as ts from "typescript";

/**
 * Owns one real configuration directory for a finite test workflow.
 * @typeParam Value - Successful assertion result.
 * @typeParam Failure - Test workflow's typed failure.
 * @typeParam Requirements - Services required by the assertion workflow.
 * @param use - Assertions whose TypeScript options depend on this native directory.
 * @returns Lazy assertions with typed I/O failures and coordinated directory cleanup.
 */
function configuration<Value, Failure, Requirements>(
  use: (root: string) => Effect.Effect<Value, Failure, Requirements>,
) {
  return Effect.acquireUseRelease(
    Effect.tryPromise(() => mkdtemp(resolve(tmpdir(), "relkit-resolution-"))),
    use,
    (root) => Effect.tryPromise(() => rm(root, { recursive: true, force: true })),
  );
}

it.live("uses inherited aliases and .js-to-TypeScript resolution without evaluating modules", () =>
  configuration((root) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise(() =>
        writeFile(
          resolve(root, "base.json"),
          JSON.stringify({
            compilerOptions: {
              baseUrl: ".",
              moduleResolution: "Bundler",
              paths: { "@app/*": ["src/*"] },
            },
          }),
        ),
      );
      yield* Effect.tryPromise(() =>
        writeFile(resolve(root, "tsconfig.json"), '{"extends":"./base.json"}'),
      );
      const sources = new Map([
        ["src/services/orders/helper.ts", "throw new Error('must not execute');"],
        ["src/services/payments/service.ts", "throw new Error('must not execute');"],
        ["src/services/payments/functions/charge.ts", "throw new Error('must not execute');"],
      ]);
      const operation = Effect.gen(function* () {
        const resolver = yield* SourceResolution;
        expect(
          yield* resolver.resolve(
            "src/services/orders/helper.ts",
            "@app/services/payments/service.js",
          ),
        ).toEqual({ kind: "source", file: "src/services/payments/service.ts" });
        expect(
          yield* resolver.resolve(
            "src/services/orders/helper.ts",
            "../payments/functions/charge.js",
          ),
        ).toEqual({ kind: "source", file: "src/services/payments/functions/charge.ts" });
        expect(yield* resolver.resolve("src/services/orders/helper.ts", "@app/missing.js")).toEqual(
          { kind: "unresolved", application: true },
        );
        expect(
          yield* resolver.resolve("src/services/orders/helper.ts", "external-package"),
        ).toEqual({ kind: "unresolved", application: false });
      });
      yield* operation.pipe(Effect.provide(sourceResolutionLayer({ root, sources })));
    }),
  ),
);

it.live("keeps configuration failures in Layer acquisition and preserves the cause", () =>
  configuration((root) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise(() =>
        writeFile(resolve(root, "tsconfig.json"), '{"extends":"./missing.json"}'),
      );
      const exit = yield* Effect.exit(
        Effect.gen(function* () {
          yield* SourceResolution;
        }).pipe(Effect.provide(sourceResolutionLayer({ root, sources: new Map() }))),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(exit.cause.reasons).toContainEqual(
          expect.objectContaining({
            _tag: "Fail",
            error: expect.objectContaining({
              _tag: "Compiler.SourceResolutionError",
              root,
              cause: expect.any(Error),
            }),
          }),
        );
    }),
  ),
);

it.live(
  "keeps installed and linked workspace dependencies outside application sources external",
  () =>
    configuration((root) =>
      Effect.gen(function* () {
        const app = resolve(root, "app"),
          dependency = resolve(root, "dependency");
        yield* Effect.tryPromise(async () => {
          await mkdir(resolve(app, "node_modules/installed"), { recursive: true });
          await mkdir(dependency);
          for (const directory of [dependency, resolve(app, "node_modules/installed")]) {
            await writeFile(resolve(directory, "package.json"), '{"types":"index.d.ts"}');
            await writeFile(
              resolve(directory, "index.d.ts"),
              "export declare const value: number;",
            );
          }
          await symlink(dependency, resolve(app, "node_modules/linked"));
        });
        for (const preserveSymlinks of [false, true]) {
          yield* Effect.tryPromise(() =>
            writeFile(
              resolve(app, "tsconfig.json"),
              JSON.stringify({
                compilerOptions: { moduleResolution: "Bundler", preserveSymlinks },
              }),
            ),
          );
          yield* Effect.gen(function* () {
            const resolver = yield* SourceResolution;
            for (const specifier of ["installed", "linked"])
              expect(yield* resolver.resolve("src/orders/helper.ts", specifier)).toEqual({
                kind: "external",
              });
          }).pipe(
            Effect.provide(
              sourceResolutionLayer({
                root: app,
                sources: new Map([["src/orders/helper.ts", "export {};"]]),
              }),
            ),
          );
        }
      }),
    ),
);

it.effect("substitutes the same service contract and retains resolver defects", () =>
  Effect.gen(function* () {
    const fake = Layer.succeed(
      SourceResolution,
      SourceResolution.of({
        resolve: () => Effect.succeed({ kind: "source", file: "src/services/orders/service.ts" }),
      }),
    );
    const operation = Effect.gen(function* () {
      return yield* (yield* SourceResolution).resolve("src/routes/route.ts", "target");
    });
    expect(yield* operation.pipe(Effect.provide(fake))).toEqual({
      kind: "source",
      file: "src/services/orders/service.ts",
    });
    const defect = new Error("resolver bug");
    const failure = yield* operation.pipe(
      Effect.provideService(SourceResolution, { resolve: () => Effect.die(defect) }),
      Effect.exit,
    );
    expect(failure).toMatchObject({
      _tag: "Failure",
      cause: { reasons: [{ _tag: "Die", defect }] },
    });
  }),
);

it.effect("records standalone option acquisition outcomes without changing failure channels", () =>
  Effect.gen(function* () {
    const options = yield* sourceResolutionOptionsEffect("/not-a-real-project", ts.sys);
    expect(options).toEqual({});
    const outcome = Metric.counter("relkit_compiler_outcomes_total", { incremental: true });
    expect(
      (yield* Metric.value(
        Metric.withAttributes(outcome, {
          stage: "configuration",
          operation: "sourceResolutionOptions",
          outcome: "success",
        }),
      )).count,
    ).toBe(1);
  }).pipe(Effect.provideService(Metric.MetricRegistry, new Map())),
);

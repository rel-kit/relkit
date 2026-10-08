import { expect, it } from "@effect/vitest";
import { defineApp } from "@relkit/app/config";
import { defineEnv } from "@relkit/config";
import { Deferred, Effect, Fiber, Layer, Logger, Ref } from "effect";
import { TestClock } from "effect/testing";
import { generatorFileSystemLive } from "create-relkit";
import ts from "typescript";
import { CliFileSystem } from "../../src/services/filesystem.service.js";
import { CliModules } from "../../src/services/modules.service.js";
import { CliProcess } from "../../src/services/process.service.js";
import { CliCleanup, cleanupLayer } from "../../src/services/cleanup.service.js";
import { cliAdapterError } from "../../src/cli-errors.js";
import {
  CliDoctor,
  doctorLive,
  doctorProjectEffect,
} from "../../src/commands/doctor-project.service.js";
import { CliDoctorToolchain } from "../../src/commands/doctor-toolchain.service.js";
import { checkRootsEffect } from "../../src/commands/doctor-roots.js";
import { doctorCommandEffect } from "../../src/commands/doctor-native.js";
import { runDoctorEffect } from "../../src/commands/doctor.js";
import { CliStartNative } from "../../src/commands/start-native.service.js";
import { waitForStartHealthEffect } from "../../src/commands/start-health.js";
import { testFiles } from "../read-services/test-files.js";

it.effect("collects ordered checks using the same live domain with deterministic authority", () =>
  Effect.gen(function* () {
    const mutations: string[] = [];
    const app = defineApp({ id: "doctor-layer", env: defineEnv({}) });
    const authority = Layer.mergeAll(
      Layer.succeed(
        CliFileSystem,
        testFiles({
          readText: () =>
            Effect.succeed(
              JSON.stringify({ version: ts.version, dependencies: { effect: "4.0.1" } }),
            ),
          mkdir: () => Effect.void,
          writeText: (path) =>
            Effect.sync(() => {
              mutations.push("write:" + path);
            }),
          remove: (path) =>
            Effect.sync(() => {
              mutations.push("remove:" + path);
            }),
        }),
      ),
      Layer.succeed(CliModules, {
        load: () => Effect.succeed({ default: app }),
        invalidate: () => Effect.void,
      }),
      Layer.succeed(CliProcess, {
        run: () => Effect.succeed({ exitCode: 0, stdout: "", stderr: "" }),
      }),
      cleanupLayer,
      generatorFileSystemLive,
      Layer.succeed(CliDoctorToolchain, {
        bunVersion: () => Effect.succeed("1.3.10"),
        typeScriptPath: () => Effect.succeed("/typescript/package.json"),
        which: () => Effect.succeed(null),
        satisfies: () => Effect.succeed(true),
      }),
    );
    const report = yield* doctorProjectEffect({ deploymentEnabled: false, skipPorts: true }).pipe(
      Effect.provide(doctorLive),
      Effect.provide(authority),
      Effect.provide(Logger.layer([])),
    );
    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => check.name)).toEqual([
      "bun",
      "typescript",
      "relkit-packages",
      "config",
      "app",
      "pulumi",
      "aws-credentials",
      "relkit-roots",
      "ports",
      "lockfile",
    ]);
    expect(mutations.filter((entry) => entry.startsWith("write:"))).toHaveLength(5);
    expect(mutations.filter((entry) => entry.startsWith("remove:"))).toHaveLength(5);
  }),
);

it.effect("retains marker cleanup evidence alongside the failed write report", () =>
  Effect.gen(function* () {
    const failure = cliAdapterError("write", new Error("Read-only filesystem."));
    const secondary = cliAdapterError("remove", new Error("Removal failed."));
    yield* Effect.gen(function* () {
      const report = yield* checkRootsEffect("/project");
      expect(report.ok).toBe(false);
      const issues = yield* (yield* CliCleanup).snapshot();
      expect(issues).toHaveLength(5);
      expect(issues.every((issue) => issue.operation === "doctor.marker.release")).toBe(true);
    }).pipe(
      Effect.provide(
        Layer.merge(
          Layer.succeed(
            CliFileSystem,
            testFiles({
              mkdir: () => Effect.void,
              writeText: () => Effect.fail(failure),
              remove: () => Effect.fail(secondary),
            }),
          ),
          cleanupLayer,
        ),
      ),
      Effect.provide(Logger.layer([])),
    );
  }),
);

it.effect("reports usage without acquiring prerequisite work", () =>
  Effect.gen(function* () {
    const errors: string[] = [];
    const result = yield* runDoctorEffect(["--unknown"], {
      json: false,
      reporter: { output: () => undefined, error: (code) => errors.push(code) },
    }).pipe(
      Effect.provide(
        Layer.succeed(CliDoctor, {
          check: () => Effect.die("Doctor must not run for invalid syntax."),
        }),
      ),
      Effect.provide(Logger.layer([])),
    );
    expect(result).toBe(2);
    expect(errors).toEqual(["RELKIT_DOCTOR_USAGE"]);
  }),
);

it.live("interruption aborts an injected command and waits for physical completion", () =>
  Effect.gen(function* () {
    const started = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    const settlement = Promise.withResolvers<void>();
    yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => settlement.resolve()));
    const completed = yield* Ref.make(false);
    const command = yield* Effect.forkScoped(
      doctorCommandEffect(["test"], "/", async (_command, _cwd, signal) => {
        signal?.addEventListener("abort", () => aborted.resolve(), { once: true });
        started.resolve();
        await settlement.promise;
        return { exitCode: 0 };
      }).pipe(
        Effect.provide(
          Layer.succeed(CliProcess, {
            run: () => Effect.die("Injected runner must own the command."),
          }),
        ),
        Effect.provide(Logger.layer([])),
      ),
    );
    yield* Effect.promise(() => started.promise);
    const interruption = yield* Effect.forkScoped(
      Fiber.interrupt(command).pipe(Effect.tap(() => Ref.set(completed, true))),
    );
    yield* Effect.promise(() => aborted.promise);
    expect(yield* Ref.get(completed)).toBe(false);
    settlement.resolve();
    yield* Fiber.join(interruption);
    expect(yield* Ref.get(completed)).toBe(true);
  }),
);

it.effect("uses a controlled clock deadline and interrupts a stalled readiness request", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const cancelled = yield* Ref.make(false);
    const layer = Layer.succeed(CliStartNative, {
      allocate: () => Effect.succeed(3000),
      health: () =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Ref.set(cancelled, true)),
        ),
    });
    const task = yield* Effect.forkScoped(
      waitForStartHealthEffect("localhost", 3000, 100, { exitCode: null }).pipe(
        Effect.provide(layer),
        Effect.provide(Logger.layer([])),
      ),
    );
    yield* Deferred.await(started);
    yield* TestClock.adjust(100);
    const exit = yield* Fiber.await(task);
    expect(exit._tag).toBe("Failure");
    expect(yield* Ref.get(cancelled)).toBe(true);
  }),
);

it.effect("retries only idempotent health probes and recovers from transient failures", () =>
  Effect.gen(function* () {
    const calls = yield* Ref.make(0);
    const attempt = yield* Deferred.make<void>();
    const layer = Layer.succeed(CliStartNative, {
      allocate: () => Effect.succeed(3000),
      health: () =>
        Ref.updateAndGet(calls, (count) => count + 1).pipe(
          Effect.flatMap((count) =>
            count === 1
              ? Deferred.succeed(attempt, undefined).pipe(
                  Effect.andThen(
                    Effect.fail(cliAdapterError("fetch", new Error("Transient request."))),
                  ),
                )
              : Effect.succeed(true),
          ),
        ),
    });
    const task = yield* Effect.forkScoped(
      waitForStartHealthEffect("localhost", 3000, 100, { exitCode: null }).pipe(
        Effect.provide(layer),
        Effect.provide(Logger.layer([])),
      ),
    );
    yield* Deferred.await(attempt);
    yield* TestClock.adjust(25);
    yield* Fiber.join(task);
    expect(yield* Ref.get(calls)).toBe(3);
  }),
);

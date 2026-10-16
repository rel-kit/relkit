/**
 * Injects filesystem and process capabilities into the same resolver used by dev.
 * Deterministic helpers prove safe diagnostics, finite timeouts and permit release
 * after interruption, without exposing environment values or spawning processes.
 */
import { expect, it } from "@effect/vitest";
import { statSync } from "node:fs";
import { Deferred, Effect, Fiber, Layer, Result } from "effect";
import * as TestClock from "effect/testing/TestClock";
import { CliDevEnvironment } from "../../src/services/dev-environment.service.js";
import { CliProcess } from "../../src/services/process.service.js";
import { filesystemTestLayer } from "./test-layers.js";
import type { ProcessCapabilities } from "../../src/services/process.types.js";

/**
 * Supplies one active dotenv file and a controlled helper to the real resolver.
 * @param run - Test-owned process behavior; no native process is launched.
 * @returns Resolver Layer with the production operation and failure contracts.
 */
function fixture(run: ProcessCapabilities["run"]) {
  return Layer.effect(CliDevEnvironment, CliDevEnvironment.make({})).pipe(
    Layer.provide(
      Layer.merge(
        filesystemTestLayer({
          exists: (path) => Effect.succeed(path.endsWith("/.env")),
          readText: () => Effect.succeed("VALUE=synthetic-file-value\n"),
          stat: () => Effect.sync(() => statSync(import.meta.filename)),
        }),
        Layer.succeed(CliProcess, CliProcess.of({ run })),
      ),
    ),
  );
}

it.effect("does not expose malformed helper output in its typed diagnostic", () =>
  Effect.gen(function* () {
    const service = yield* CliDevEnvironment;
    const result = yield* service.resolve("/project").pipe(Effect.result);
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.operation).toBe("dev.environment.decode");
      expect(String(result.failure.cause)).not.toContain("synthetic-private-value");
    }
  }).pipe(
    Effect.provide(
      fixture(() =>
        Effect.succeed({
          exitCode: 0,
          stdout: "synthetic-private-value",
          stderr: "",
        }),
      ),
    ),
  ),
);

it.effect("a rejected helper leaves the next resolution and its permit usable", () => {
  let attempts = 0;
  return Effect.gen(function* () {
    const service = yield* CliDevEnvironment;
    const result = yield* service.resolve("/project").pipe(Effect.result);
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.operation).toBe("dev.environment.load");
      expect(String(result.failure.cause)).not.toContain("synthetic-private-value");
    }
    expect((yield* service.resolve("/project")).VALUE).toBe("repaired");
  }).pipe(
    Effect.provide(
      fixture(() =>
        Effect.sync(() => ({
          exitCode: ++attempts === 1 ? 1 : 0,
          stdout: '{"VALUE":"repaired"}',
          stderr: "synthetic-private-value",
        })),
      ),
    ),
  );
});

it.effect("timeout joins interrupted helper cleanup and releases the shared permit", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    let attempts = 0,
      cleaned = false;
    const run: ProcessCapabilities["run"] = () =>
      Effect.suspend(() => {
        if (++attempts > 1) return Effect.succeed({ exitCode: 0, stdout: "{}", stderr: "" });
        return Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              cleaned = true;
            }),
          ),
        );
      });
    yield* Effect.gen(function* () {
      const service = yield* CliDevEnvironment;
      const loading = yield* service.resolve("/project").pipe(Effect.result, Effect.forkChild);
      yield* Deferred.await(entered);
      yield* TestClock.adjust(3_000);
      const result = yield* Fiber.join(loading);
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result))
        expect(result.failure.operation).toBe("dev.environment.timeout");
      expect(cleaned).toBe(true);
      yield* service.resolve("/project");
      expect(attempts).toBe(2);
    }).pipe(Effect.provide(fixture(run)));
  }),
);

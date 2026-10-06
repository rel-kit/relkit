import { expect, it } from "@effect/vitest";
import { Cause, Effect, Layer } from "effect";
import { cliAdapterError } from "../../src/cli-errors.js";
import { runCliEffect } from "../../src/cli-runtime.js";
import { cliCleanupFailures, retainCliCleanupFailures } from "../../src/cli-cleanup-evidence.js";
import { CliCleanup, cleanupEffect, cleanupLayer } from "../../src/services/cleanup.service.js";
import { activateBuildEffect } from "../../src/commands/build-activation.js";
import { filesystemTestLayer } from "./test-layers.js";

it.effect(
  "receipts preserve native identity and enumerable JSON while retaining first and recent causes",
  () =>
    Effect.gen(function* () {
      const owner = new Error("Original publication failure.");
      const before = JSON.stringify(owner);
      const wrapper = cliAdapterError("test.native", owner);
      retainCliCleanupFailures(
        wrapper,
        Array.from({ length: 140 }, (_, index) => ({
          operation: `release-${index}`,
          cause: Cause.fail(index),
        })),
      );
      const evidence = cliCleanupFailures(owner);
      expect(evidence).toHaveLength(128);
      expect(evidence[0]?.operation).toBe("release-0");
      expect(evidence.at(-1)?.operation).toBe("release-139");
      expect(Object.isFrozen(evidence)).toBe(true);
      expect(Object.isFrozen(evidence[0])).toBe(true);
      expect(cliCleanupFailures(wrapper)).toBe(evidence);
      expect(JSON.stringify(owner)).toBe(before);
      expect(cliCleanupFailures("primitive")).toEqual([]);
    }),
);

it.live(
  "publication plus rollback failure rejects the original and retains restoration evidence",
  () =>
    Effect.gen(function* () {
      const original = new Error("Publication failed.");
      const restore = new Error("Restore failed.");
      let renames = 0;
      const layer = Layer.merge(
        cleanupLayer,
        filesystemTestLayer({
          rename: () => {
            renames += 1;
            return renames === 1
              ? Effect.void
              : Effect.fail(cliAdapterError("test.rename", renames === 2 ? original : restore));
          },
          remove: () => Effect.void,
        }),
      );
      const rejection = yield* Effect.promise(() =>
        runCliEffect(activateBuildEffect("/stage", "/build"), layer).catch(
          (error: unknown) => error,
        ),
      );
      expect(rejection).toBe(original);
      const evidence = cliCleanupFailures(original);
      expect(evidence.map((issue) => issue.operation)).toEqual(["build.rollback.restore"]);
      expect(
        evidence[0]?.cause.reasons.some(
          (reason) =>
            reason._tag === "Fail" &&
            reason.error instanceof Error &&
            "cause" in reason.error &&
            reason.error.cause === restore,
        ),
      ).toBe(true);
    }),
);

it.live("boundary disposal retains release evidence beside the successful object", () =>
  Effect.gen(function* () {
    const owner = Object.freeze({ complete: true });
    const result = yield* Effect.promise(() =>
      runCliEffect(
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() =>
            cleanupEffect("test.release", Effect.die(new Error("Native close failed."))),
          );
          return owner;
        }),
        cleanupLayer,
      ),
    );
    expect(result).toBe(owner);
    expect(JSON.stringify(result)).toBe('{"complete":true}');
    expect(cliCleanupFailures(owner).map((issue) => issue.operation)).toEqual(["test.release"]);
  }),
);

it.effect("the live ledger stays bounded without losing the first release cause", () =>
  Effect.gen(function* () {
    const cleanup = yield* CliCleanup;
    yield* Effect.forEach(
      Array.from({ length: 140 }, (_, index) => index),
      (index) => cleanup.record(`release-${index}`, Cause.fail(index)),
    );
    const evidence = yield* cleanup.snapshot();
    expect(evidence).toHaveLength(128);
    expect(evidence[0]?.operation).toBe("release-0");
    expect(evidence.at(-1)?.operation).toBe("release-139");
  }).pipe(Effect.provide(cleanupLayer)),
);

it.live(
  "numeric cleanup diagnostic keeps exit and stdout while emitting a bounded v2 JSON log",
  () =>
    Effect.gen(function* () {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const presentation = {
        json: true,
        io: {
          stdout: (line: string) => stdout.push(line),
          stderr: (line: string) => stderr.push(line),
        },
      };
      const program = Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          cleanupEffect("test.release", Effect.die(new Error("secret private native path"))),
        );
        return 7;
      });
      expect(
        yield* Effect.promise(() => runCliEffect(program, cleanupLayer, undefined, presentation)),
      ).toBe(7);
      expect(stdout).toEqual([]);
      expect(stderr).toHaveLength(1);
      expect(JSON.parse(stderr[0]!)).toMatchObject({
        version: 2,
        signal: "log",
        component: "cli",
        level: "warn",
        fields: {
          code: "RELKIT_CLI_CLEANUP_FAILED",
          count: 1,
          issues: [{ operation: "test.release", causes: ["Die"] }],
        },
      });
      expect(stderr[0]).not.toContain("secret private native path");
      stderr.length = 0;
      expect(
        yield* Effect.promise(() =>
          runCliEffect(Effect.succeed(0), Layer.empty, undefined, presentation),
        ),
      ).toBe(0);
      expect(stderr).toEqual([]);
    }),
);

it.live(
  "terminal object and error outcomes emit recent release evidence without changing identity",
  () =>
    Effect.gen(function* () {
      const stderr: string[] = [];
      const presentation = {
        json: true,
        io: { stdout: () => undefined, stderr: (line: string) => stderr.push(line) },
      };
      const owner = Object.freeze({ complete: true });
      const success = yield* Effect.promise(() =>
        runCliEffect(
          Effect.gen(function* () {
            const cleanup = yield* CliCleanup;
            yield* Effect.forEach(
              Array.from({ length: 140 }, (_, index) => index),
              (index) => cleanup.record(`jobs.sdk-release-${index}`, Cause.die("private-secret")),
            );
            return owner;
          }),
          cleanupLayer,
          undefined,
          presentation,
        ),
      );
      expect(success).toBe(owner);
      const record = JSON.parse(stderr[0]!);
      expect(record.fields.issues).toHaveLength(128);
      expect(record.fields.issues[0].operation).toBe("jobs.sdk-release-0");
      expect(record.fields.issues.at(-1).operation).toBe("jobs.sdk-release-139");
      expect(stderr[0]).not.toContain("private-secret");
      const original = new Error("Primary failure.");
      const rejected = yield* Effect.promise(() =>
        runCliEffect(
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() =>
              cleanupEffect("dev.source-watch.release", Effect.die("private-secret")),
            );
            return yield* Effect.fail(original);
          }),
          cleanupLayer,
          undefined,
          presentation,
        ).catch((error: unknown) => error),
      );
      expect(rejected).toBe(original);
      expect(stderr).toHaveLength(2);
      expect(JSON.parse(stderr[1]!).fields.issues[0].operation).toBe("dev.source-watch.release");
      expect(cliCleanupFailures(original)).toHaveLength(1);
    }),
);

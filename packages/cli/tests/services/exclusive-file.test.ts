import { expect, it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { cliAdapterError, cliOriginalError } from "../../src/cli-errors.js";
import { cliCleanupFailures } from "../../src/cli-cleanup-evidence.js";
import { writeExclusiveEffect } from "../../src/services/filesystem-exclusive.js";
import { prepareLocalWorkerOverridesEffect } from "../../src/commands/local-worker-overrides.js";
import { cleanupLayer } from "../../src/services/cleanup.service.js";
import { runCliEffect } from "../../src/cli-runtime.js";
import { filesystemTestLayer } from "./test-layers.js";

it.effect("a worker temporary-file collision never acquires removal or publication authority", () =>
  Effect.gen(function* () {
    const collision = Object.assign(new Error("Existing temporary file."), { code: "EEXIST" });
    let removes = 0;
    let renames = 0;
    const graph = Layer.merge(
      cleanupLayer,
      filesystemTestLayer({
        readText: () => Effect.succeed('{"version":1,"generationId":"accepted","bindings":[]}'),
        writeExclusive: () => Effect.fail(cliAdapterError("test.exclusive", collision)),
        remove: () =>
          Effect.sync(() => {
            removes += 1;
          }),
        rename: () =>
          Effect.sync(() => {
            renames += 1;
          }),
      }),
    );
    const result = yield* Effect.exit(
      prepareLocalWorkerOverridesEffect("/project/provider-overrides.json").pipe(
        Effect.provide(graph),
      ),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result))
      expect(
        result.cause.reasons.some(
          (reason) => reason._tag === "Fail" && cliOriginalError(reason.error) === collision,
        ),
      ).toBe(true);
    expect(removes).toBe(0);
    expect(renames).toBe(0);
  }),
);

it.live("exclusive open collision leaves the pre-existing native path untouched", () =>
  Effect.gen(function* () {
    let removed = false;
    const collision = Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    const exit = yield* Effect.exit(
      writeExclusiveEffect("/owned", "content", 0o600, {
        open: async () => {
          throw collision;
        },
        remove: async () => {
          removed = true;
        },
      }).pipe(Effect.provide(cleanupLayer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(removed).toBe(false);
  }),
);

it.live(
  "partial write cleanup closes and removes only the acquired path while retaining secondary failures",
  () =>
    Effect.gen(function* () {
      const primary = new Error("Write failed after exclusive open.");
      const close = new Error("Close failed.");
      const rollback = new Error("Owned unlink failed.");
      const calls: string[] = [];
      const rejected = yield* Effect.promise(() =>
        runCliEffect(
          writeExclusiveEffect("/owned", "content", 0o600, {
            open: async () => ({
              writeFile: async () => {
                calls.push("write");
                throw primary;
              },
              close: async () => {
                calls.push("close");
                throw close;
              },
            }),
            remove: async () => {
              calls.push("remove");
              throw rollback;
            },
          }),
          cleanupLayer,
        ).catch((error: unknown) => error),
      );
      expect(rejected).toBe(primary);
      expect(calls).toEqual(["write", "close", "remove"]);
      expect(cliCleanupFailures(primary).map((issue) => issue.operation)).toEqual([
        "filesystem.exclusive.close",
        "filesystem.exclusive.rollback",
      ]);
    }),
);

it.live(
  "primitive native write failure keeps its exact value and emits secondary cleanup evidence",
  () =>
    Effect.gen(function* () {
      const stderr: string[] = [];
      const rejected = yield* Effect.promise(() =>
        runCliEffect(
          writeExclusiveEffect("/owned", "content", 0o600, {
            open: async () => ({
              writeFile: async () => {
                throw "primitive write failure";
              },
              close: async () => {
                throw new Error("Native close failed.");
              },
            }),
            remove: async () => {
              throw new Error("Native owned rollback failed.");
            },
          }),
          cleanupLayer,
          undefined,
          { json: true, io: { stdout: () => undefined, stderr: (line) => stderr.push(line) } },
        ).catch((error: unknown) => error),
      );
      expect(rejected).toBe("primitive write failure");
      expect(
        JSON.parse(stderr[0]!).fields.issues.map((issue: { operation: string }) => issue.operation),
      ).toEqual(["filesystem.exclusive.close", "filesystem.exclusive.rollback"]);
    }),
);

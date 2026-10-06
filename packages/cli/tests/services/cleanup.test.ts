import { expect, it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { CliAdapterError } from "../../src/cli-errors.js";
import { CliCleanup, cleanupLayer } from "../../src/services/cleanup.service.js";
import { CliProcess } from "../../src/services/process.service.js";
import { activateBuildEffect } from "../../src/commands/build-activation.js";
import { bundleServerEffect } from "../../src/commands/build-support.js";
import { buildProjectEffect } from "../../src/commands/build.js";
import { emptyCheckOutputs } from "../../src/commands/check-support.js";
import { compilerTestLayer, filesystemTestLayer, modulesTestLayer } from "./test-layers.js";

const failure = (operation: string) =>
  new CliAdapterError({ operation, cause: new Error(operation), message: operation });

it.effect("failed bundling retains its primary failure and separate unlink evidence", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(bundleServerEffect("/stage/server", "/project"));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit))
      expect(
        exit.cause.reasons.some(
          (reason) => reason._tag === "Fail" && reason.error.message === "bundle crashed",
        ),
      ).toBe(true);
    const cleanup = yield* CliCleanup;
    const evidence = yield* cleanup.snapshot();
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.operation).toBe("build.moduleLink.remove");
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        cleanupLayer,
        filesystemTestLayer({
          symlink: () => Effect.void,
          unlink: () => Effect.fail(failure("unlink failed")),
        }),
        Layer.succeed(
          CliProcess,
          CliProcess.of({
            run: () => Effect.succeed({ exitCode: 1, stdout: "", stderr: "bundle crashed" }),
          }),
        ),
      ),
    ),
  ),
);

it.effect("backup cleanup evidence does not change an already published cohort", () =>
  Effect.gen(function* () {
    const published = yield* Effect.exit(activateBuildEffect("/stage", "/build"));
    expect(Exit.isSuccess(published)).toBe(true);
    const cleanup = yield* CliCleanup;
    expect((yield* cleanup.snapshot()).map((issue) => issue.operation)).toEqual([
      "build.previous.remove",
    ]);
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        cleanupLayer,
        filesystemTestLayer({
          rename: () => Effect.void,
          remove: () => Effect.fail(failure("remove backup failed")),
        }),
      ),
    ),
  ),
);

it.effect("a failed graph retains its diagnostic when stage removal also fails", () =>
  Effect.gen(function* () {
    const checked = {
      ok: true,
      activatable: true,
      projectRoot: "/project",
      generatedDirectory: "/generated",
      graphHash: "sha256:graph",
      diagnostics: [],
      outputs: { ...emptyCheckOutputs([]), graph: "{" },
    };
    const result = yield* buildProjectEffect({
      projectRoot: "/project",
      check: async () => checked,
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "RELKIT_BUILD_FAILED" })]);
    const cleanup = yield* CliCleanup;
    expect((yield* cleanup.snapshot()).map((issue) => issue.operation)).toEqual([
      "build.stage.remove",
    ]);
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        cleanupLayer,
        compilerTestLayer(),
        modulesTestLayer,
        filesystemTestLayer({
          stage: () => Effect.succeed("/stage"),
          remove: () => Effect.fail(failure("remove stage failed")),
        }),
        Layer.succeed(CliProcess, CliProcess.of({ run: () => Effect.die("Unexpected bundler.") })),
      ),
    ),
  ),
);

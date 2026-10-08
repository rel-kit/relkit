import { dirname, join, resolve } from "node:path";
import { Effect } from "effect";
import { createDiagnostic } from "@relkit/diagnostics";
import { cliOriginalError, cliPromise } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { cleanupEffect } from "../services/cleanup.service.js";
import { buildCapabilitiesLayer } from "../services/project-capabilities.js";
import { checkProjectEffect } from "./check.js";
import { buildFailure } from "./build-result.js";
import { stageBuildEffect } from "./build-stage.js";
import { errorMessage } from "./build-support.js";
import type { BuildOptions } from "./build.types.js";
export type { BuildOptions, BuildResult } from "./build.types.js";

/**
 * Builds one cohort using scoped staging, concurrent native readers, and atomic publication.
 * @param options - Build roots, compiler inputs, and an optional foreign check adapter.
 * @returns A lazy build result; interruption and defects remain visible and never activate a partial stage.
 */
export const buildProjectEffect = Effect.fn("Project.build")(
  function* (options: BuildOptions = {}) {
    const projectRoot = resolve(options.projectRoot ?? process.cwd());
    const buildDirectory = resolve(options.buildDirectory ?? join(projectRoot, ".relkit", "build"));
    const checked =
      options.check === undefined
        ? yield* checkProjectEffect({ ...options, mode: "production" })
        : yield* cliPromise("build.checkOverride", (signal) =>
            options.check!({ ...options, mode: "production", signal }),
          );
    const graphHash = checked.graphHash;
    if (!checked.ok || graphHash === undefined)
      return buildFailure(projectRoot, buildDirectory, checked.diagnostics);
    const files = yield* CliFileSystem;
    const work = Effect.scoped(
      Effect.gen(function* () {
        const stage = yield* Effect.acquireRelease(
          files.stage(join(dirname(buildDirectory), ".relkit-build-")),
          (stage) => cleanupEffect("build.stage.remove", files.remove(stage)),
        );
        return yield* stageBuildEffect({
          projectRoot,
          buildDirectory,
          stage,
          checked: { ...checked, graphHash },
          options,
        });
      }),
    );
    return yield* work.pipe(
      Effect.catchTag("CliAdapterError", (error) =>
        Effect.succeed(
          buildFailure(projectRoot, buildDirectory, [
            ...checked.diagnostics,
            createDiagnostic({
              code: "RELKIT_BUILD_FAILED",
              severity: "error",
              message: errorMessage(cliOriginalError(error)),
            }),
          ]),
        ),
      ),
    );
  },
  (effect, _options: BuildOptions = {}) => observeCli("project.build", effect),
);

/**
 * Builds a project at its established Promise boundary.
 * @param options - Build and compiler settings, including caller cancellation.
 * @returns A published cohort or diagnostic failure after staged cleanup completes.
 */
export function buildProject(options: BuildOptions = {}) {
  return runCliEffect(buildProjectEffect(options), buildCapabilitiesLayer, options.signal);
}
/** Legacy alias for the public build boundary. */
export const runBuild = buildProject;

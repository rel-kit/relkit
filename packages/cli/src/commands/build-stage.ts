/**
 * Coordinates materialization, bundling and atomic publication of one accepted
 * build cohort. The caller owns stage rollback; interruption wins before the
 * publication transaction, and no partial executable stage becomes current.
 */
import { Effect } from "effect";
import { observeCli } from "../cli-runtime.js";
import { activateBuildEffect } from "./build-activation.js";
import { bundleServerEffect } from "./build-support.js";
import { buildArtifacts } from "./build-manifest.js";
import { loadBuildStageCohort } from "./build-stage-cohort.js";
import { writeBuildAssets, writeBuildMetadata, writeBuildServer } from "./build-stage-files.js";
import type { BuildResult, BuildStageInputs } from "./build.types.js";

/**
 * Publishes a complete stage after validation and native bundling succeed.
 * @param input - Owned stage, accepted check and immutable build options.
 * @returns Lazy successful build requiring filesystem/compiler/process authority;
 * typed adapter failures, defects and interruption remain visible to rollback.
 */
export const stageBuildEffect = Effect.fn("Project.stageBuild")(
  function* (input: BuildStageInputs) {
    const cohort = yield* loadBuildStageCohort(input);
    yield* writeBuildAssets(input, cohort);
    yield* writeBuildServer(input, cohort);
    yield* bundleServerEffect(
      cohort.serverDirectory,
      input.projectRoot,
      input.options.mode === "development",
      input.options.bundleInputInventory,
    );
    yield* writeBuildMetadata(input, cohort);
    // Pending cancellation must win before the short publication transaction.
    yield* Effect.yieldNow;
    yield* activateBuildEffect(input.stage, input.buildDirectory);
    return Object.freeze({
      ok: true,
      projectRoot: input.projectRoot,
      buildDirectory: input.buildDirectory,
      graphHash: cohort.graphHash,
      activationFingerprint: cohort.activationFingerprint,
      diagnostics: input.checked.diagnostics,
      artifacts: buildArtifacts(
        cohort.jobsManifest !== undefined,
        cohort.localServicesPlanSource !== undefined,
      ),
    }) satisfies BuildResult;
  },
  (effect, _input: BuildStageInputs) => observeCli("build.stage", effect),
);

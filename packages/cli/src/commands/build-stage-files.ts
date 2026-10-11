/**
 * Materializes a validated build cohort inside the caller's owned stage. It
 * writes graph/server/container bytes without publishing; only an absent public
 * directory is optional, and mixed failure Causes remain intact for rollback.
 */
import { join } from "node:path";
import { Effect, Schema } from "effect";
import {
  canonicalJson,
  RUNTIME_ACTIVATION_FILE,
  RUNTIME_INTEGRATION_PLAN_FILE,
} from "@relkit/contracts";
import { GENERATED_ARTIFACT_FILES } from "@relkit/compiler";
import { cliOriginalError, cliTry, type CliAdapterError } from "../cli-errors.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { stageJobsEffect } from "./build-jobs.js";
import { serverSource } from "./build-server.js";
import { dockerfile, dockerignore } from "./build-container.js";
import { buildManifest } from "./build-manifest.js";
import type { BuildStageCohort, BuildStageInputs } from "./build.types.js";

/**
 * Writes graph, optional workers and public assets into one owned stage.
 * @param input - Stage and accepted check output.
 * @param cohort - Validated identity loaded before materialization.
 * @returns Lazy writes requiring existing filesystem/compiler authority.
 */
export const writeBuildAssets = Effect.fn("Project.buildAssets")(function* (
  input: BuildStageInputs,
  cohort: BuildStageCohort,
) {
  const files = yield* CliFileSystem;
  yield* files.mkdir(cohort.serverDirectory);
  yield* files.writeText(
    join(input.stage, "application.graph.json"),
    `${canonicalJson(cohort.graph)}\n`,
  );
  yield* stageJobsEffect(input.buildDirectory, input.stage, cohort.jobsManifest);
  yield* files.writeText(
    join(input.stage, "openapi.json"),
    input.checked.outputs.openapi || "{}\n",
  );
  yield* files.mkdir(join(input.stage, "public"));
  yield* files.copy(join(input.projectRoot, "public"), join(input.stage, "public")).pipe(
    Effect.catchCause((cause) => {
      const reason = cause.reasons[0];
      if (cause.reasons.length === 1 && reason?._tag === "Fail" && missingDirectory(reason.error))
        return Effect.void;
      return Effect.failCause(cause);
    }),
  );
});

/**
 * Emits executable source and cohort files from the same accepted compiler data.
 * @param input - Immutable check and stage inputs.
 * @param cohort - Validated graph, plans and activation identity.
 * @returns Lazy bounded-concurrency writes; no application source is evaluated.
 */
export const writeBuildServer = Effect.fn("Project.buildServer")(function* (
  input: BuildStageInputs,
  cohort: BuildStageCohort,
) {
  const files = yield* CliFileSystem;
  const outputs = input.checked.outputs;
  const entrypoint = yield* cliTry("build.serverSource", () =>
    serverSource(
      cohort.graph,
      cohort.graphHash,
      cohort.activationFingerprint,
      Schema.decodeUnknownSync(Schema.Json)(JSON.parse(outputs.openapi || "{}")),
      Schema.decodeUnknownSync(Schema.Json)(JSON.parse(outputs.clientContract || "{}")),
      {
        ...cohort.tooling.server,
        maxPreviewBytes: cohort.tooling.inspector.maxPreviewBytes,
        ...(input.options.bundleInputInventory === undefined
          ? {}
          : { httpApplication: "prepared" }),
      },
    ),
  );
  const members: ReadonlyArray<readonly [string, string]> = [
    ["runtime.manifest.ts", cohort.manifestSource],
    [RUNTIME_ACTIVATION_FILE, `${canonicalJson(cohort.activationFingerprint)}\n`],
    [RUNTIME_INTEGRATION_PLAN_FILE, outputs.runtimeIntegrations],
    [GENERATED_ARTIFACT_FILES.runtimeIntegrationImports, outputs.runtimeIntegrationImports],
    ...(cohort.localServicesPlanSource === undefined
      ? []
      : [[GENERATED_ARTIFACT_FILES.localServices, cohort.localServicesPlanSource] as const]),
    ["index.ts", entrypoint],
  ];
  yield* Effect.forEach(
    members,
    ([name, text]) => files.writeText(join(cohort.serverDirectory, name), text),
    { concurrency: 4, discard: true },
  );
});

/**
 * Records production manifest/container metadata after a successful bundle.
 * @param input - Caller-owned stage.
 * @param cohort - Accepted activation identity and deployment projections.
 * @returns Lazy metadata writes; publication remains owned by the calling workflow.
 */
export const writeBuildMetadata = Effect.fn("Project.buildMetadata")(function* (
  input: BuildStageInputs,
  cohort: BuildStageCohort,
) {
  const files = yield* CliFileSystem;
  yield* files.writeText(
    join(input.stage, "manifest.json"),
    buildManifest({
      graphHash: cohort.graphHash,
      activationFingerprint: cohort.activationFingerprint,
      hasJobs: cohort.jobsManifest !== undefined,
      hasLocalServices: cohort.localServicesPlanSource !== undefined,
      tooling: cohort.tooling,
    }),
  );
  yield* files.writeText(
    join(input.stage, "Dockerfile"),
    dockerfile(cohort.jobsManifest !== undefined),
  );
  yield* files.writeText(
    join(input.stage, ".dockerignore"),
    dockerignore(cohort.jobsManifest !== undefined),
  );
});

/**
 * Recognizes the sole expected optional-public-assets failure.
 * @param error - Typed native failure from the exact copy operation.
 * @returns Whether its original failure is an absent source directory.
 */
function missingDirectory(error: CliAdapterError): boolean {
  const original = cliOriginalError(error);
  return original instanceof Error && "code" in original && original.code === "ENOENT";
}

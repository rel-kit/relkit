import { dirname, join } from "node:path";
import { Effect, Schema } from "effect";
import { observeCli } from "../cli-runtime.js";
import {
  canonicalJson,
  RUNTIME_ACTIVATION_FILE,
  RUNTIME_INTEGRATION_PLAN_FILE,
} from "@relkit/contracts";
import {
  createRuntimeActivationFingerprint,
  DEFAULT_TOOLING_CONFIG,
  GENERATED_ARTIFACT_FILES,
} from "@relkit/compiler";
import { hashGraph, validateGraphShape, type ApplicationGraph } from "@relkit/graph";
import { cliOriginalError, cliTry } from "../cli-errors.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { serverSource } from "./build-server.js";
import { selectedLocalServicePlan } from "./build-cohort.js";
import { activateBuildEffect } from "./build-activation.js";
import { parseJobsManifest, stageJobsEffect } from "./build-jobs.js";
import { bundleServerEffect, dockerfile, dockerignore, rebaseManifest } from "./build-support.js";
import { buildArtifacts, buildManifest } from "./build-manifest.js";
import type { BuildResult, BuildStageInputs } from "./build.types.js";

/**
 * Materializes and publishes one complete stage after validating all cohort identities.
 * @param input - Owned stage, accepted compilation, and immutable build options.
 * @returns A lazy successful build result; the caller owns stage rollback on failure/interruption.
 */
export const stageBuildEffect = Effect.fn("Project.stageBuild")(
  function* (input: BuildStageInputs) {
    const { projectRoot, buildDirectory, stage, checked, options } = input;
    const files = yield* CliFileSystem;
    const jobsManifest = yield* cliTry("build.jobsManifest", () =>
      parseJobsManifest(checked.outputs.jobsManifest),
    );
    const graph = yield* cliTry("build.graph", () =>
      parseBuildGraph(checked.outputs.graph, projectRoot),
    );
    const graphHash = yield* cliTry("build.graphHash", () => {
      const hash = hashGraph(graph);
      if (hash !== checked.graphHash) throw new Error("Graph changed before build.");
      return hash;
    });
    const manifestPath = join(checked.generatedDirectory, "runtime.manifest.ts");
    const manifestText = yield* files.readText(manifestPath);
    const manifestSource = rebaseManifest(
      manifestText,
      projectRoot,
      dirname(manifestPath),
      join(buildDirectory, "server"),
    );
    const localServicesPlanSource = yield* cliTry("build.localPlan", () =>
      selectedLocalServicePlan(
        graphHash,
        checked.outputs.runtimeIntegrations,
        checked.outputs.localServices,
      ),
    );
    const activationFingerprint = yield* cliTry("build.fingerprint", () =>
      createRuntimeActivationFingerprint({
        graphHash,
        manifestSource,
        ...(checked.outputs.jobsManifest === undefined
          ? {}
          : { jobsManifestSource: checked.outputs.jobsManifest }),
        runtimeIntegrationsPlanSource: checked.outputs.runtimeIntegrations,
        ...(localServicesPlanSource === undefined ? {} : { localServicesPlanSource }),
        ...(options.providerOverridesGeneration === undefined
          ? {}
          : { providerOverridesGeneration: options.providerOverridesGeneration }),
      }),
    );
    const openapi = checked.outputs.openapi;
    const tooling = checked.config ?? DEFAULT_TOOLING_CONFIG;
    const serverDirectory = join(stage, "server");
    yield* files.mkdir(serverDirectory);
    yield* files.writeText(join(stage, "application.graph.json"), `${canonicalJson(graph)}\n`);
    yield* stageJobsEffect(buildDirectory, stage, jobsManifest);
    yield* files.writeText(join(stage, "openapi.json"), openapi === "" ? "{}\n" : openapi);
    yield* files.mkdir(join(stage, "public"));
    yield* files.copy(join(projectRoot, "public"), join(stage, "public")).pipe(
      Effect.catchTag("CliAdapterError", (error) => {
        const cause = cliOriginalError(error);
        return cause instanceof Error && "code" in cause && cause.code === "ENOENT"
          ? Effect.void
          : Effect.fail(error);
      }),
    );
    const entrypoint = yield* cliTry("build.serverSource", () =>
      serverSource(
        graph,
        graphHash,
        activationFingerprint,
        Schema.decodeUnknownSync(Schema.Json)(JSON.parse(openapi === "" ? "{}" : openapi)),
        Schema.decodeUnknownSync(Schema.Json)(
          JSON.parse(checked.outputs.clientContract === "" ? "{}" : checked.outputs.clientContract),
        ),
        { ...tooling.server, maxPreviewBytes: tooling.inspector.maxPreviewBytes },
      ),
    );
    const serverFiles: ReadonlyArray<readonly [string, string]> = [
      ["runtime.manifest.ts", manifestSource],
      [RUNTIME_ACTIVATION_FILE, `${canonicalJson(activationFingerprint)}\n`],
      [RUNTIME_INTEGRATION_PLAN_FILE, checked.outputs.runtimeIntegrations],
      [
        GENERATED_ARTIFACT_FILES.runtimeIntegrationImports,
        checked.outputs.runtimeIntegrationImports,
      ],
      ...(localServicesPlanSource === undefined
        ? []
        : [[GENERATED_ARTIFACT_FILES.localServices, localServicesPlanSource] as const]),
      ["index.ts", entrypoint],
    ];
    yield* Effect.forEach(
      serverFiles,
      ([name, text]) => files.writeText(join(serverDirectory, name), text),
      { concurrency: 4, discard: true },
    );
    yield* bundleServerEffect(serverDirectory, projectRoot, options.mode === "development");
    yield* files.writeText(
      join(stage, "manifest.json"),
      buildManifest({
        graphHash,
        activationFingerprint,
        hasJobs: jobsManifest !== undefined,
        hasLocalServices: localServicesPlanSource !== undefined,
        tooling,
      }),
    );
    yield* files.writeText(join(stage, "Dockerfile"), dockerfile(jobsManifest !== undefined));
    yield* files.writeText(join(stage, ".dockerignore"), dockerignore(jobsManifest !== undefined));
    // A pending interrupt wins before the short, uninterruptible publication transaction.
    yield* Effect.yieldNow;
    yield* activateBuildEffect(stage, buildDirectory);
    return Object.freeze({
      ok: true,
      projectRoot,
      buildDirectory,
      graphHash,
      activationFingerprint,
      diagnostics: checked.diagnostics,
      artifacts: buildArtifacts(jobsManifest !== undefined, localServicesPlanSource !== undefined),
    }) satisfies BuildResult;
  },
  (effect, _input: BuildStageInputs) => observeCli("build.stage", effect),
);

/**
 * Promotes compiler bytes only after the graph owner's complete validator accepts them.
 * @param source - Compiler-produced graph JSON.
 * @param projectRoot - Root used by graph source validation.
 * @returns A validated application graph; the owner's void validator necessitates this boundary assertion.
 */
function parseBuildGraph(source: string, projectRoot: string): ApplicationGraph {
  const value: unknown = JSON.parse(source);
  validateGraphShape(value, projectRoot);
  return value as ApplicationGraph;
}

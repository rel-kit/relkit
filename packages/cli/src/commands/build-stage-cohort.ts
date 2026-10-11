/**
 * Reads and validates the compiler cohort once for a build stage. Graph semantics
 * remain owned by the graph validator; source rebasing and activation hashing
 * precede writes so all later steps consume the same accepted identity.
 */
import { dirname, join } from "node:path";
import { Effect, Schema } from "effect";
import { createRuntimeActivationFingerprint, DEFAULT_TOOLING_CONFIG } from "@relkit/compiler";
import { hashGraph, validateGraphShapeEffect, type ApplicationGraph } from "@relkit/graph";
import { cliAdapterError, cliTry } from "../cli-errors.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { selectedLocalServicePlan } from "./build-cohort.js";
import { parseJobsManifest } from "./build-jobs.js";
import { rebaseManifest } from "./build-support.js";
import { preparedRuntimeManifest } from "./build-prepared-manifest.js";
import type { BuildStageCohort, BuildStageInputs } from "./build.types.js";

/**
 * Captures validated graph, manifest and plans without publishing executable data.
 * @param input - Accepted check, owned stage and final publication directory.
 * @returns Lazy coherent stage data requiring filesystem authority; native and
 * validator rejections stay typed, while defects and interruption propagate.
 */
export const loadBuildStageCohort = Effect.fn("Project.buildCohort")(function* (
  input: BuildStageInputs,
) {
  const { projectRoot, buildDirectory, stage, checked } = input;
  const files = yield* CliFileSystem;
  const graph = yield* parseBuildGraph(checked.outputs.graph, projectRoot);
  const graphHash = hashGraph(graph);
  if (graphHash !== checked.graphHash)
    return yield* cliAdapterError("build.graphHash", new Error("Graph changed before build."));
  const jobsManifest = yield* cliTry("build.jobsManifest", () =>
    parseJobsManifest(checked.outputs.jobsManifest),
  );
  const manifestPath = join(checked.generatedDirectory, "runtime.manifest.ts");
  const manifestText = yield* files.readText(manifestPath);
  const preparedManifest =
    input.options.bundleInputInventory === undefined
      ? manifestText
      : preparedRuntimeManifest(manifestText, graph, projectRoot, dirname(manifestPath));
  const manifestSource = rebaseManifest(
    preparedManifest,
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
  const activationFingerprint = yield* stageActivation(
    input,
    graphHash,
    manifestSource,
    localServicesPlanSource,
  );
  return {
    graph,
    graphHash,
    jobsManifest,
    manifestSource,
    localServicesPlanSource,
    activationFingerprint,
    tooling: checked.config ?? DEFAULT_TOOLING_CONFIG,
    serverDirectory: join(stage, "server"),
  } satisfies BuildStageCohort;
});

/**
 * Hashes the exact accepted executable manifest and runtime plans together.
 * @param input - Accepted compiler outputs and provider generation override.
 * @param graphHash - Already validated semantic graph identity.
 * @param manifestSource - Manifest rebased for the publication directory.
 * @param localServicesPlanSource - Optional selected local-service plan bytes.
 * @returns Lazy activation identity or typed pure-library rejection.
 */
function stageActivation(
  input: BuildStageInputs,
  graphHash: string,
  manifestSource: string,
  localServicesPlanSource: string | undefined,
) {
  const outputs = input.checked.outputs;
  return cliTry("build.fingerprint", () =>
    createRuntimeActivationFingerprint({
      graphHash,
      manifestSource,
      ...(outputs.jobsManifest === undefined ? {} : { jobsManifestSource: outputs.jobsManifest }),
      runtimeIntegrationsPlanSource: outputs.runtimeIntegrations,
      ...(localServicesPlanSource === undefined ? {} : { localServicesPlanSource }),
      ...(input.options.providerOverridesGeneration === undefined
        ? {}
        : { providerOverridesGeneration: input.options.providerOverridesGeneration }),
    }),
  );
}

/**
 * Decodes compiler JSON and grants graph authority after its owner validates it.
 * @param source - Compiler graph bytes.
 * @param projectRoot - Authored source containment root for semantic validation.
 * @returns Lazy validated graph or typed native/semantic rejection.
 */
function parseBuildGraph(source: string, projectRoot: string) {
  return cliTry("build.graph.json", () =>
    Schema.decodeUnknownSync(Schema.Json)(JSON.parse(source)),
  ).pipe(
    Effect.flatMap((value) =>
      validateGraphShapeEffect(value, projectRoot).pipe(
        Effect.mapError((error) => cliAdapterError("build.graph", error)),
        // The complete owning validator returns void; only its success proves this graph intersection.
        Effect.map(() => value as typeof value & ApplicationGraph),
      ),
    ),
  );
}

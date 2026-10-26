/** Validates the built graph and manifest before trusting their fixed production artifact paths. */
import { join } from "node:path";
import { Effect, Schema } from "effect";
import {
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_ACTIVATION_FILE,
  RUNTIME_INTEGRATION_PLAN_FILE,
} from "@relkit/contracts";
import {
  assertProductionGraph,
  hashGraph,
  validateGraphShapeEffect,
  type ApplicationGraph,
} from "@relkit/graph";
import { LOCAL_SERVICE_PLAN_FILE } from "@relkit/local-service";
import { cliAdapterError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { validateBuiltArtifactsEffect } from "./start-built-artifacts.js";
import { builtJsonObject, builtManifestSchema } from "./start-built.schemas.js";
import { expectVersion } from "./start-built-validation.js";
import type { BuiltManifest } from "./start-built.types.js";

/**
 * Validates structure, fixed paths, versions and activation identity in order.
 * @param buildDirectory - Root containing emitted artifacts.
 * @returns A coherent identity; each native failure retains its original diagnostic.
 */
export const readBuiltWorkflow = Effect.fn("BuiltProject.validate")(
  function* (buildDirectory: string) {
    const graph = yield* readBuiltGraphEffect(buildDirectory);
    const manifest = yield* readBuiltManifestEffect(buildDirectory);
    const graphHash = hashGraph(graph);
    yield* validateBuiltPathsEffect(buildDirectory, manifest, graphHash);
    yield* validateBuiltArtifactsEffect(buildDirectory, manifest, graphHash);
    return { graphHash, manifest };
  },
  (effect) => observeCli("start.built.validate", effect),
);

/** Validates the graph owner contract before promoting untrusted JSON to the graph type. */
const readBuiltGraphEffect = Effect.fn("BuiltProject.graph")(function* (buildDirectory: string) {
  const files = yield* CliFileSystem;
  const graphValue: unknown = yield* files
    .readText(join(buildDirectory, "application.graph.json"))
    .pipe(
      Effect.flatMap((source) => cliTry("start.graph.json", () => JSON.parse(source) as unknown)),
    );
  // The build-specific version diagnostic precedes the general graph validator,
  // whose regeneration hint belongs to authoring rather than production startup.
  yield* cliTry("start.version", () =>
    expectVersion(
      Schema.is(builtJsonObject)(graphValue) ? graphValue.contractVersion : undefined,
      GRAPH_VERSION,
      "Built graph contract",
    ),
  );
  yield* validateGraphShapeEffect(graphValue, buildDirectory).pipe(
    Effect.mapError((error) => cliAdapterError("start.graph", error)),
  );
  // Promotion follows the graph owner's full structural validator.
  const graph = graphValue as ApplicationGraph;
  yield* cliTry("start.graph.production", () => assertProductionGraph(graph));
  return graph;
});

/** Decodes manifest metadata and retains the existing version-check order and diagnostics. */
const readBuiltManifestEffect = Effect.fn("BuiltProject.manifest")(function* (
  buildDirectory: string,
) {
  const files = yield* CliFileSystem;
  const manifestValue: unknown = yield* files
    .readText(join(buildDirectory, "manifest.json"))
    .pipe(
      Effect.flatMap((source) =>
        cliTry("start.manifest.json", () => JSON.parse(source) as unknown),
      ),
    );
  const manifest = yield* Schema.decodeUnknownEffect(builtManifestSchema)(manifestValue).pipe(
    Effect.mapError(() =>
      cliAdapterError("start.manifest", new Error("Built manifest paths are invalid.")),
    ),
  );
  yield* cliTry("start.version", () =>
    expectVersion(manifest.contractVersion, CONTRACT_VERSION, "Built public contract"),
  );
  yield* cliTry("start.version", () =>
    expectVersion(manifest.graphVersion, GRAPH_VERSION, "Built graph manifest"),
  );
  yield* cliTry("start.version", () =>
    expectVersion(manifest.manifestVersion, MANIFEST_VERSION, "Built runtime manifest"),
  );
  yield* cliTry("start.version", () =>
    expectVersion(manifest.generatorVersion, GENERATOR_VERSION, "Built generator"),
  );
  return manifest;
});

/** Checks cohort identity and fixed emitted paths before any manifest-directed file access. */
const validateBuiltPathsEffect = Effect.fn("BuiltProject.paths")(function* (
  buildDirectory: string,
  manifest: BuiltManifest,
  graphHash: string,
) {
  if (manifest.graphHash !== graphHash) {
    return yield* Effect.fail(
      cliAdapterError("start.built", new Error("Built graph and manifest hashes do not match.")),
    );
  }
  if (
    manifest.entrypoint !== "server/index.js" ||
    manifest.containerEntrypoint !== "server/index.js" ||
    manifest.runtimeManifestFile !== "server/runtime.manifest.ts" ||
    (manifest.jobsManifestFile !== undefined &&
      manifest.jobsManifestFile !== "jobs.manifest.json") ||
    manifest.runtimeActivationFile !== `server/${RUNTIME_ACTIVATION_FILE}` ||
    manifest.runtimeIntegrationsPlanFile !== `server/${RUNTIME_INTEGRATION_PLAN_FILE}` ||
    (manifest.localServicesPlanFile !== undefined &&
      manifest.localServicesPlanFile !== `server/${LOCAL_SERVICE_PLAN_FILE}`)
  ) {
    return yield* Effect.fail(
      cliAdapterError("start.built", new Error("Built manifest paths are invalid.")),
    );
  }
  const files = yield* CliFileSystem;
  yield* files.stat(join(buildDirectory, manifest.entrypoint));
  yield* files.stat(join(buildDirectory, manifest.containerEntrypoint));
});

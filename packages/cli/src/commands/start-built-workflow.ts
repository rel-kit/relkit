import { join } from "node:path";
import { Effect, Schema } from "effect";
import {
  canonicalJson,
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_ACTIVATION_FILE,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
  isRuntimeActivationFingerprint,
} from "@relkit/contracts";
import { createRuntimeActivationFingerprint } from "@relkit/compiler";
import {
  assertProductionGraph,
  hashGraph,
  validateGraphShapeEffect,
  type ApplicationGraph,
} from "@relkit/graph";
import { LOCAL_SERVICE_PLAN_FILE } from "@relkit/local-service";
import { parseJobsManifest } from "./build-jobs.js";
import { cliAdapterError, cliOriginalError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { builtJsonObject, builtManifestSchema } from "./start-built.schemas.js";
import {
  expectVersion,
  parseArtifact,
  versionOf,
  expectGraphHash,
  validateLocalServices,
} from "./start-built-validation.js";

/**
 * Validates structure, fixed paths, versions and activation identity in order.
 * @param buildDirectory - Root containing emitted artifacts.
 * @returns A coherent identity; each native failure retains its original diagnostic.
 */
export const readBuiltWorkflow = Effect.fn("BuiltProject.validate")(
  function* (buildDirectory: string) {
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
    const graphHash = hashGraph(graph);
    if (manifest.graphHash !== graphHash) {
      return yield* Effect.fail(
        cliAdapterError("start.built", new Error("Built graph and manifest hashes do not match.")),
      );
    }
    if (
      manifest.entrypoint !== "server/index.ts" ||
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
    yield* files.stat(join(buildDirectory, manifest.entrypoint));
    yield* files.stat(join(buildDirectory, manifest.containerEntrypoint));
    const runtimeManifest = yield* files.readText(
      join(buildDirectory, manifest.runtimeManifestFile),
    );
    const jobsManifestSource =
      manifest.jobsManifestFile === undefined
        ? undefined
        : yield* readArtifactEffect(buildDirectory, manifest.jobsManifestFile, "jobs manifest");
    yield* cliTry("start.jobs", () => parseJobsManifest(jobsManifestSource));
    const activationSource = yield* readArtifactEffect(
      buildDirectory,
      manifest.runtimeActivationFile,
      "activation fingerprint",
    );
    const activation = yield* cliTry("start.activation", () =>
      parseArtifact(activationSource, "activation fingerprint"),
    );
    if (!isRuntimeActivationFingerprint(activation))
      return yield* Effect.fail(
        cliAdapterError("start.built", new Error("Built activation fingerprint is invalid.")),
      );
    if (!isRuntimeActivationFingerprint(manifest.activationFingerprint))
      return yield* Effect.fail(
        cliAdapterError(
          "start.built",
          new Error("Built manifest activation fingerprint is invalid."),
        ),
      );
    const runtimeIntegrations = yield* readArtifactEffect(
      buildDirectory,
      manifest.runtimeIntegrationsPlanFile,
      "runtime-integration plan",
    );
    const runtimeIntegrationPlan = yield* cliTry("start.integration.json", () =>
      parseArtifact(runtimeIntegrations, "runtime-integration plan"),
    );
    yield* cliTry("start.integration.version", () =>
      expectVersion(
        versionOf(runtimeIntegrationPlan),
        RUNTIME_INTEGRATION_PLAN_VERSION,
        "Built runtime-integration plan",
      ),
    );
    yield* cliTry("start.integration.hash", () =>
      expectGraphHash(runtimeIntegrationPlan, graphHash, "Built runtime-integration plan"),
    );
    const localServices =
      manifest.localServicesPlanFile === undefined
        ? undefined
        : yield* readArtifactEffect(
            buildDirectory,
            manifest.localServicesPlanFile,
            "local-service plan",
          );
    if (localServices !== undefined)
      yield* cliTry("start.local", () => validateLocalServices(localServices, graphHash));
    const expected = createRuntimeActivationFingerprint({
      graphHash,
      manifestSource: runtimeManifest,
      ...(jobsManifestSource === undefined ? {} : { jobsManifestSource }),
      runtimeIntegrationsPlanSource: runtimeIntegrations,
      ...(localServices === undefined ? {} : { localServicesPlanSource: localServices }),
      ...(activation.providerOverridesGeneration === undefined
        ? {}
        : { providerOverridesGeneration: activation.providerOverridesGeneration }),
    });
    if (
      canonicalJson(activation) !== canonicalJson(expected) ||
      canonicalJson(manifest.activationFingerprint) !== canonicalJson(expected)
    )
      return yield* Effect.fail(
        cliAdapterError(
          "start.built",
          new Error("Built activation fingerprint does not match its artifacts."),
        ),
      );
    if (!runtimeManifest.includes(`manifestGraphHash = ${JSON.stringify(graphHash)}`)) {
      return yield* Effect.fail(
        cliAdapterError(
          "start.built",
          new Error("Built runtime manifest hash does not match the graph."),
        ),
      );
    }
    return { graphHash, manifest };
  },
  (effect) => observeCli("start.built.validate", effect),
);

/**
 * Reads an owned artifact while retaining the established missing-build message.
 * @param root - Build root.
 * @param path - Manifest-owned fixed relative path.
 * @param label - Diagnostic artifact kind.
 * @returns Original bytes or a typed missing/native failure.
 */
const readArtifactEffect = Effect.fn("BuiltProject.artifact")(
  function* (root: string, path: string, label: string) {
    return yield* (yield* CliFileSystem).readText(join(root, path)).pipe(
      Effect.mapError((error) => {
        const cause = cliOriginalError(error);
        return cause instanceof Error && "code" in cause && cause.code === "ENOENT"
          ? cliAdapterError(
              "start.artifact",
              new Error(`Built ${label} is missing; rebuild with \`relkit build\`.`),
            )
          : error;
      }),
    );
  },
  (effect) => observeCli("start.built.artifact", effect),
);

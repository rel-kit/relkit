import {
  canonicalJson,
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_ACTIVATION_FILE,
  RUNTIME_INTEGRATION_PLAN_FILE,
} from "@relkit/contracts";
import { GENERATED_ARTIFACT_FILES } from "@relkit/compiler";
import type { BuildManifestInputs } from "./build.types.js";

/**
 * Serializes an accepted cohort's portable manifest without reading the environment.
 * @param input - Verified graph, activation identity, and compiler settings.
 * @returns Canonical manifest bytes with one final newline.
 */
export function buildManifest(input: BuildManifestInputs): string {
  return `${canonicalJson({
    contractVersion: CONTRACT_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphVersion: GRAPH_VERSION,
    manifestVersion: MANIFEST_VERSION,
    graphHash: input.graphHash,
    activationFingerprint: input.activationFingerprint,
    graphFile: "application.graph.json",
    ...(input.hasJobs ? { jobsManifestFile: GENERATED_ARTIFACT_FILES.jobsManifest } : {}),
    runtimeManifestFile: "server/runtime.manifest.ts",
    runtimeActivationFile: `server/${RUNTIME_ACTIVATION_FILE}`,
    runtimeIntegrationsPlanFile: `server/${RUNTIME_INTEGRATION_PLAN_FILE}`,
    ...(input.hasLocalServices
      ? { localServicesPlanFile: `server/${GENERATED_ARTIFACT_FILES.localServices}` }
      : {}),
    entrypoint: "server/index.ts",
    containerEntrypoint: "server/index.js",
    contextIgnoreFile: ".dockerignore",
    server: input.tooling.server,
    inspector: input.tooling.inspector,
  })}\n`;
}

/**
 * Lists the published cohort's stable public artifact paths.
 * @param hasJobs - Whether an immutable jobs manifest and worker history were staged.
 * @param hasLocalServices - Whether the cohort includes selected local resources.
 * @returns Frozen paths in the established public order.
 */
export function buildArtifacts(hasJobs: boolean, hasLocalServices: boolean): readonly string[] {
  return Object.freeze([
    ".dockerignore",
    "Dockerfile",
    "application.graph.json",
    ...(hasJobs ? [GENERATED_ARTIFACT_FILES.jobsManifest, "jobs/"] : []),
    "manifest.json",
    "openapi.json",
    "public/",
    "server/index.js",
    "server/index.ts",
    `server/${RUNTIME_ACTIVATION_FILE}`,
    `server/${RUNTIME_INTEGRATION_PLAN_FILE}`,
    `server/${GENERATED_ARTIFACT_FILES.runtimeIntegrationImports}`,
    "server/runtime.manifest.ts",
    ...(hasLocalServices ? [`server/${GENERATED_ARTIFACT_FILES.localServices}`] : []),
  ]);
}

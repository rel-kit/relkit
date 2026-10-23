/** Serializes build artifacts and exact selected production dependencies with their native repairs. */
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
import { repairSelectedAuthManifest } from "../scaffolding/auth-manifest-repair.js";

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
    entrypoint: "server/index.js",
    containerEntrypoint: "server/index.js",
    contextIgnoreFile: ".dockerignore",
    server: input.tooling.server,
    inspector: input.tooling.inspector,
  })}\n`;
}

/**
 * Emits exact selected runtime installs independently from the authored application manifest.
 * @param dependencies - Exact versions observed for the selected runtime owners and SDKs.
 * @param patchedDependencies - Canonical selected SDK patch registrations emitted alongside their verified assets.
 * @returns Serialized production manifest with exact dependencies and selected native repairs.
 */
export function buildProductionManifest(
  dependencies: Readonly<Record<string, string>>,
  patchedDependencies: Readonly<Record<string, string>> = {},
): string {
  const version = dependencies["drizzle-orm"];
  if (version !== undefined && patchedDependencies[`drizzle-orm@${version}`] === undefined)
    throw new TypeError("Selected Drizzle production repair is missing.");
  const manifest = {
    name: "relkit-production-artifact",
    private: true,
    type: "module",
    packageManager: "bun@1.3.10",
    dependencies,
    ...(Object.keys(patchedDependencies).length === 0 ? {} : { patchedDependencies }),
  };
  repairSelectedAuthManifest(manifest);
  return `${canonicalJson(manifest)}\n`;
}

/**
 * Lists the published cohort's stable public artifact paths.
 * @param hasJobs - Whether an immutable jobs manifest and worker history were staged.
 * @param hasLocalServices - Whether the cohort includes selected local resources.
 * @param hasRepairs - Whether selected native patch assets belong to the artifact allowlist.
 * @returns Frozen paths in the established public order.
 */
export function buildArtifacts(
  hasJobs: boolean,
  hasLocalServices: boolean,
  hasRepairs = false,
): readonly string[] {
  return Object.freeze([
    ".dockerignore",
    "Dockerfile",
    "application.graph.json",
    ...(hasJobs ? [GENERATED_ARTIFACT_FILES.jobsManifest, "jobs/"] : []),
    "manifest.json",
    "openapi.json",
    "package.json",
    ...(hasRepairs ? ["patches/"] : []),
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

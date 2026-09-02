import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
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
  type RuntimeActivationFingerprint,
} from "@relkit/contracts";
import { createRuntimeActivationFingerprint } from "@relkit/compiler";
import { assertProductionGraph, hashGraph, type ApplicationGraph } from "@relkit/graph";
import { LOCAL_SERVICE_PLAN_FILE, LOCAL_SERVICE_PLAN_VERSION } from "@relkit/local-service";

export interface BuiltManifest {
  readonly contractVersion: number;
  readonly generatorVersion: number;
  readonly graphVersion: number;
  readonly manifestVersion: number;
  readonly graphHash: string;
  readonly activationFingerprint: RuntimeActivationFingerprint;
  readonly entrypoint: string;
  readonly containerEntrypoint: string;
  readonly runtimeManifestFile: string;
  readonly runtimeActivationFile: string;
  readonly runtimeIntegrationsPlanFile: string;
  readonly localServicesPlanFile?: string;
  readonly server?: { readonly port?: number };
}

export async function readBuilt(
  buildDirectory: string,
): Promise<{ readonly graphHash: string; readonly manifest: BuiltManifest }> {
  const graph = JSON.parse(
    await readFile(join(buildDirectory, "application.graph.json"), "utf8"),
  ) as ApplicationGraph;
  assertProductionGraph(graph);
  const manifest = JSON.parse(
    await readFile(join(buildDirectory, "manifest.json"), "utf8"),
  ) as BuiltManifest;
  expectVersion(graph.contractVersion, GRAPH_VERSION, "Built graph contract");
  expectVersion(manifest.contractVersion, CONTRACT_VERSION, "Built public contract");
  expectVersion(manifest.graphVersion, GRAPH_VERSION, "Built graph manifest");
  expectVersion(manifest.manifestVersion, MANIFEST_VERSION, "Built runtime manifest");
  expectVersion(manifest.generatorVersion, GENERATOR_VERSION, "Built generator");
  const graphHash = hashGraph(graph);
  if (manifest.graphHash !== graphHash) {
    throw new Error("Built graph and manifest hashes do not match.");
  }
  if (
    manifest.entrypoint !== "server/index.ts" ||
    manifest.containerEntrypoint !== "server/index.js" ||
    manifest.runtimeManifestFile !== "server/runtime.manifest.ts" ||
    manifest.runtimeActivationFile !== `server/${RUNTIME_ACTIVATION_FILE}` ||
    manifest.runtimeIntegrationsPlanFile !== `server/${RUNTIME_INTEGRATION_PLAN_FILE}` ||
    (manifest.localServicesPlanFile !== undefined &&
      manifest.localServicesPlanFile !== `server/${LOCAL_SERVICE_PLAN_FILE}`)
  ) {
    throw new Error("Built manifest paths are invalid.");
  }
  await access(join(buildDirectory, manifest.entrypoint));
  await access(join(buildDirectory, manifest.containerEntrypoint));
  const runtimeManifest = await readFile(
    join(buildDirectory, manifest.runtimeManifestFile),
    "utf8",
  );
  const activation = parseArtifact(
    await readArtifact(buildDirectory, manifest.runtimeActivationFile, "activation fingerprint"),
    "activation fingerprint",
  );
  if (!isRuntimeActivationFingerprint(activation))
    throw new Error("Built activation fingerprint is invalid.");
  if (!isRuntimeActivationFingerprint(manifest.activationFingerprint))
    throw new Error("Built manifest activation fingerprint is invalid.");
  const runtimeIntegrations = await readArtifact(
    buildDirectory,
    manifest.runtimeIntegrationsPlanFile,
    "runtime-integration plan",
  );
  const runtimeIntegrationPlan = parseArtifact(runtimeIntegrations, "runtime-integration plan");
  expectVersion(
    versionOf(runtimeIntegrationPlan),
    RUNTIME_INTEGRATION_PLAN_VERSION,
    "Built runtime-integration plan",
  );
  expectGraphHash(runtimeIntegrationPlan, graphHash, "Built runtime-integration plan");
  const localServices =
    manifest.localServicesPlanFile === undefined
      ? undefined
      : await readArtifact(buildDirectory, manifest.localServicesPlanFile, "local-service plan");
  if (localServices !== undefined) validateLocalServices(localServices, graphHash);
  const expected = createRuntimeActivationFingerprint({
    graphHash,
    manifestSource: runtimeManifest,
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
    throw new Error("Built activation fingerprint does not match its artifacts.");
  if (!runtimeManifest.includes(`manifestGraphHash = ${JSON.stringify(graphHash)}`)) {
    throw new Error("Built runtime manifest hash does not match the graph.");
  }
  return { graphHash, manifest };
}

function expectVersion(actual: unknown, expected: number, label: string): void {
  if (actual !== expected)
    throw new Error(
      `${label} version ${String(actual)} is unsupported; expected ${expected}. Rebuild with \`relkit build\`.`,
    );
}

async function readArtifact(root: string, path: string, label: string): Promise<string> {
  try {
    return await readFile(join(root, path), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      throw new Error(`Built ${label} is missing; rebuild with \`relkit build\`.`);
    throw error;
  }
}

function parseArtifact(source: string, label: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error(`Built ${label} is invalid JSON; rebuild with \`relkit build\`.`);
  }
}

function versionOf(value: unknown): unknown {
  return isRecord(value) ? value.version : undefined;
}

function expectGraphHash(value: unknown, graphHash: string, label: string): void {
  if (!isRecord(value) || value.graphHash !== graphHash)
    throw new Error(`${label} does not match the built graph; rebuild with \`relkit build\`.`);
}

function validateLocalServices(source: string, graphHash: string): void {
  const value = parseArtifact(source, "local-service plan");
  expectVersion(versionOf(value), LOCAL_SERVICE_PLAN_VERSION, "Built local-service plan");
  expectGraphHash(value, graphHash, "Built local-service plan");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

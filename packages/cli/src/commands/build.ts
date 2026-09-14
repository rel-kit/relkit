import { dirname, join, resolve } from "node:path";
import { cp, mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import {
  canonicalJson,
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_ACTIVATION_FILE,
  RUNTIME_INTEGRATION_PLAN_FILE,
  type JsonValue,
  type RuntimeActivationFingerprint,
} from "@relkit/contracts";
import {
  createRuntimeActivationFingerprint,
  DEFAULT_TOOLING_CONFIG,
  GENERATED_ARTIFACT_FILES,
} from "@relkit/compiler";
import { hashGraph, validateGraphShape, type ApplicationGraph } from "@relkit/graph";
import { createDiagnostic, type Diagnostic } from "@relkit/diagnostics";
import { checkProject, type CheckOptions, type CheckResult } from "./check.js";
import { serverSource } from "./build-server.js";
import { selectedLocalServicePlan } from "./build-cohort.js";
import { activateBuild } from "./build-activation.js";
import { parseJobsManifest, stageJobs, taskJobsRuntimeDiagnostic } from "./build-jobs.js";
import { buildFailure } from "./build-result.js";
import {
  bundleServer,
  dockerfile,
  dockerignore,
  errorMessage,
  rebaseManifest,
} from "./build-support.js";
export interface BuildOptions extends CheckOptions {
  readonly buildDirectory?: string;
  readonly check?: (options: CheckOptions) => Promise<CheckResult>;
  readonly providerOverridesGeneration?: string;
}
export interface BuildResult {
  readonly ok: boolean;
  readonly projectRoot: string;
  readonly buildDirectory: string;
  readonly graphHash?: string;
  readonly activationFingerprint?: RuntimeActivationFingerprint;
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: readonly string[];
}
export async function buildProject(options: BuildOptions = {}): Promise<BuildResult> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const buildDirectory = resolve(options.buildDirectory ?? join(projectRoot, ".relkit", "build"));
  const checked = await (options.check ?? checkProject)({ ...options, mode: "production" });
  if (!checked.ok || checked.graphHash === undefined)
    return buildFailure(projectRoot, buildDirectory, checked.diagnostics);
  const jobsManifest = parseJobsManifest(checked.outputs.jobsManifest);
  if (jobsManifest !== undefined)
    return buildFailure(projectRoot, buildDirectory, [
      ...checked.diagnostics,
      taskJobsRuntimeDiagnostic(),
    ]);
  const stage = await mkdtemp(join(dirname(buildDirectory), ".relkit-build-"));
  try {
    const graph = JSON.parse(checked.outputs.graph) as ApplicationGraph;
    validateGraphShape(graph, projectRoot);
    const graphHash = hashGraph(graph);
    if (graphHash !== checked.graphHash) throw new Error("Graph changed before build.");
    const manifestPath = join(checked.generatedDirectory, "runtime.manifest.ts");
    const manifestSource = rebaseManifest(
      await readFile(manifestPath, "utf8"),
      projectRoot,
      dirname(manifestPath),
      join(buildDirectory, "server"),
    );
    const localServicesPlanSource = selectedLocalServicePlan(
      graphHash,
      checked.outputs.runtimeIntegrations,
      checked.outputs.localServices,
    );
    const activationFingerprint = createRuntimeActivationFingerprint({
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
    });
    const openapi = checked.outputs.openapi;
    const tooling = checked.config ?? DEFAULT_TOOLING_CONFIG;
    const serverDirectory = join(stage, "server");
    await mkdir(serverDirectory, { recursive: true });
    await writeFile(join(stage, "application.graph.json"), `${canonicalJson(graph)}\n`);
    await stageJobs(buildDirectory, stage, jobsManifest);
    await writeFile(join(stage, "openapi.json"), openapi === "" ? "{}\n" : openapi);
    await mkdir(join(stage, "public"), { recursive: true });
    await cp(join(projectRoot, "public"), join(stage, "public"), {
      recursive: true,
      force: true,
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    await writeFile(join(serverDirectory, "runtime.manifest.ts"), manifestSource);
    await writeFile(
      join(serverDirectory, RUNTIME_ACTIVATION_FILE),
      `${canonicalJson(activationFingerprint)}\n`,
    );
    await writeFile(
      join(serverDirectory, RUNTIME_INTEGRATION_PLAN_FILE),
      checked.outputs.runtimeIntegrations,
    );
    await writeFile(
      join(serverDirectory, GENERATED_ARTIFACT_FILES.runtimeIntegrationImports),
      checked.outputs.runtimeIntegrationImports,
    );
    if (localServicesPlanSource !== undefined)
      await writeFile(
        join(serverDirectory, GENERATED_ARTIFACT_FILES.localServices),
        localServicesPlanSource,
      );
    await writeFile(
      join(serverDirectory, "index.ts"),
      serverSource(
        graph,
        graphHash,
        activationFingerprint,
        JSON.parse(openapi === "" ? "{}" : openapi) as JsonValue,
        JSON.parse(
          checked.outputs.clientContract === "" ? "{}" : checked.outputs.clientContract,
        ) as JsonValue,
        { ...tooling.server, maxPreviewBytes: tooling.inspector.maxPreviewBytes },
      ),
    );
    await bundleServer(serverDirectory, projectRoot, options.mode === "development");
    await writeFile(
      join(stage, "manifest.json"),
      `${canonicalJson({
        contractVersion: CONTRACT_VERSION,
        generatorVersion: GENERATOR_VERSION,
        graphVersion: GRAPH_VERSION,
        manifestVersion: MANIFEST_VERSION,
        graphHash,
        activationFingerprint,
        graphFile: "application.graph.json",
        ...(jobsManifest === undefined
          ? {}
          : { jobsManifestFile: GENERATED_ARTIFACT_FILES.jobsManifest }),
        runtimeManifestFile: "server/runtime.manifest.ts",
        runtimeActivationFile: `server/${RUNTIME_ACTIVATION_FILE}`,
        runtimeIntegrationsPlanFile: `server/${RUNTIME_INTEGRATION_PLAN_FILE}`,
        ...(localServicesPlanSource === undefined
          ? {}
          : { localServicesPlanFile: `server/${GENERATED_ARTIFACT_FILES.localServices}` }),
        entrypoint: "server/index.ts",
        containerEntrypoint: "server/index.js",
        contextIgnoreFile: ".dockerignore",
        server: tooling.server,
        inspector: tooling.inspector,
      })}\n`,
    );
    await writeFile(join(stage, "Dockerfile"), dockerfile(jobsManifest !== undefined));
    await writeFile(join(stage, ".dockerignore"), dockerignore(jobsManifest !== undefined));
    await activateBuild(stage, buildDirectory);
    return Object.freeze({
      ok: true,
      projectRoot,
      buildDirectory,
      graphHash,
      activationFingerprint,
      diagnostics: checked.diagnostics,
      artifacts: Object.freeze([
        ".dockerignore",
        "Dockerfile",
        "application.graph.json",
        ...(jobsManifest === undefined ? [] : [GENERATED_ARTIFACT_FILES.jobsManifest, "jobs/"]),
        "manifest.json",
        "openapi.json",
        "public/",
        "server/index.js",
        "server/index.ts",
        `server/${RUNTIME_ACTIVATION_FILE}`,
        `server/${RUNTIME_INTEGRATION_PLAN_FILE}`,
        `server/${GENERATED_ARTIFACT_FILES.runtimeIntegrationImports}`,
        "server/runtime.manifest.ts",
        ...(localServicesPlanSource === undefined
          ? []
          : [`server/${GENERATED_ARTIFACT_FILES.localServices}`]),
      ]),
    });
  } catch (error) {
    await rm(stage, { recursive: true, force: true }).catch(() => undefined);
    return buildFailure(projectRoot, buildDirectory, [
      ...checked.diagnostics,
      createDiagnostic({
        code: "RELKIT_BUILD_FAILED",
        severity: "error",
        message: errorMessage(error),
      }),
    ]);
  }
}
export const runBuild = buildProject;

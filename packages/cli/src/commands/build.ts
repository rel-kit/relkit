import { dirname, join, relative, resolve } from "node:path";
import { mkdtemp, readFile, rename, rm, writeFile, mkdir } from "node:fs/promises";
import {
  canonicalJson,
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
} from "@zsys/contracts";
import { hashGraph, type ApplicationGraph } from "@zsys/graph";
import { createDiagnostic, type Diagnostic } from "@zsys/diagnostics";
import { checkProject, type CheckOptions, type CheckResult } from "./check.js";
import { serverSource } from "./build-server.js";

export interface BuildOptions extends CheckOptions {
  readonly buildDirectory?: string;
  readonly check?: (options: CheckOptions) => Promise<CheckResult>;
}

export interface BuildResult {
  readonly ok: boolean;
  readonly projectRoot: string;
  readonly buildDirectory: string;
  readonly graphHash?: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: readonly string[];
}

/** Builds a deterministic production directory from a successful compiler result. */
export async function buildProject(options: BuildOptions = {}): Promise<BuildResult> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const buildDirectory = resolve(options.buildDirectory ?? join(projectRoot, ".zsys", "build"));
  const checked = await (options.check ?? checkProject)(options);
  if (!checked.ok || checked.graphHash === undefined)
    return failure(projectRoot, buildDirectory, checked.diagnostics);
  const stage = await mkdtemp(join(dirname(buildDirectory), ".zsys-build-"));
  try {
    const graph = JSON.parse(checked.outputs.graph) as ApplicationGraph;
    const graphHash = hashGraph(graph);
    if (graphHash !== checked.graphHash)
      throw new Error("Compiler graph hash changed before build.");
    const manifestPath = join(checked.generatedDirectory, "runtime.manifest.ts");
    const manifestSource = rebaseManifest(
      await readFile(manifestPath, "utf8"),
      projectRoot,
      dirname(manifestPath),
      join(buildDirectory, "server"),
    );
    const openapi = checked.outputs.openapi;
    const serverDirectory = join(stage, "server");
    await mkdir(serverDirectory, { recursive: true });
    await writeFile(join(stage, "application.graph.json"), `${canonicalJson(graph)}\n`);
    await writeFile(join(stage, "openapi.json"), openapi === "" ? "{}\n" : openapi);
    await writeFile(join(serverDirectory, "runtime.manifest.ts"), manifestSource);
    await writeFile(join(serverDirectory, "index.ts"), serverSource(graph, graphHash));
    await bundleServer(serverDirectory, projectRoot);
    await writeFile(
      join(stage, "manifest.json"),
      `${canonicalJson({
        contractVersion: CONTRACT_VERSION,
        generatorVersion: GENERATOR_VERSION,
        graphVersion: GRAPH_VERSION,
        manifestVersion: MANIFEST_VERSION,
        graphHash,
        graphFile: "application.graph.json",
        runtimeManifestFile: "server/runtime.manifest.ts",
        entrypoint: "server/index.ts",
        containerEntrypoint: "server/index.js",
        contextIgnoreFile: ".dockerignore",
      })}\n`,
    );
    await writeFile(join(stage, "Dockerfile"), dockerfile());
    await writeFile(join(stage, ".dockerignore"), dockerignore());
    await rm(buildDirectory, { recursive: true, force: true });
    await rename(stage, buildDirectory);
    return Object.freeze({
      ok: true,
      projectRoot,
      buildDirectory,
      graphHash,
      diagnostics: checked.diagnostics,
      artifacts: Object.freeze([
        ".dockerignore",
        "Dockerfile",
        "application.graph.json",
        "manifest.json",
        "openapi.json",
        "server/index.js",
        "server/index.ts",
        "server/runtime.manifest.ts",
      ]),
    });
  } catch (error) {
    await rm(stage, { recursive: true, force: true }).catch(() => undefined);
    return failure(projectRoot, buildDirectory, [
      ...checked.diagnostics,
      createDiagnostic({
        code: "ZSYS_BUILD_FAILED",
        severity: "error",
        message: errorMessage(error),
      }),
    ]);
  }
}

export const runBuild = buildProject;

function failure(
  projectRoot: string,
  buildDirectory: string,
  diagnostics: readonly Diagnostic[],
): BuildResult {
  return Object.freeze({
    ok: false,
    projectRoot,
    buildDirectory,
    diagnostics: Object.freeze([...diagnostics]),
    artifacts: [],
  });
}

function dockerfile(): string {
  return `FROM oven/bun:1.3.10
WORKDIR /app
RUN addgroup --system zsys && adduser --system --ingroup zsys zsys
COPY server/index.js ./server/index.js
COPY application.graph.json manifest.json openapi.json ./
USER zsys
ENV NODE_ENV=production
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["bun", "run", "--no-env-file", "server/index.js"]
`;
}

function dockerignore(): string {
  return `*
!Dockerfile
!.dockerignore
!manifest.json
!application.graph.json
!openapi.json
!server/
!server/index.js
.env
.env.*
.zsys/state
.zsys/observability
`;
}

async function bundleServer(serverDirectory: string, projectRoot: string): Promise<void> {
  const child = Bun.spawn(
    [
      process.execPath,
      "build",
      "--target=bun",
      "--format=esm",
      "--minify",
      "--sourcemap=none",
      "--env=disable",
      `--outfile=${join(serverDirectory, "index.js")}`,
      join(serverDirectory, "index.ts"),
    ],
    { cwd: projectRoot, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    const message = error.trim() || output.trim() || "Unable to bundle the production server.";
    throw new Error(message);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rebaseManifest(
  source: string,
  projectRoot: string,
  sourceDirectory: string,
  targetDirectory: string,
): string {
  const sourcePrefix = manifestImportPrefix(sourceDirectory, projectRoot);
  const targetPrefix = manifestImportPrefix(targetDirectory, projectRoot);
  return source.replaceAll(`from "${sourcePrefix}`, `from "${targetPrefix}`);
}

function manifestImportPrefix(directory: string, projectRoot: string): string {
  const rootPath = relative(directory, projectRoot).replaceAll("\\", "/");
  return rootPath === "" ? "./" : `${rootPath}/`;
}

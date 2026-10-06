import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import { CliProcess, processLayer } from "../services/process.service.js";
import { cleanupEffect, cleanupLayer } from "../services/cleanup.service.js";

const BUN_IMAGE =
  "oven/bun:1.3.10@sha256:b86c67b531d87b4db11470d9b2bd0c519b1976eee6fcd71634e73abfa6230d2e";

/** Renders the container build and startup source for the accepted artifact cohort.
 * @param includeJobs - Whether the accepted cohort includes immutable workers.
 * @returns The existing pinned Bun image and container startup source.
 */
export function dockerfile(includeJobs = false): string {
  const jobs = includeJobs ? "COPY jobs.manifest.json ./\nCOPY jobs/ ./jobs/\n" : "";
  return `FROM ${BUN_IMAGE}
ARG SOURCE_DATE_EPOCH=0
WORKDIR /app
COPY server/index.js ./server/index.js
COPY application.graph.json manifest.json openapi.json ./
${jobs}COPY public/ ./public/
RUN mkdir -p .relkit/state .relkit/observability && chown -R bun:bun .relkit
USER bun
ENV NODE_ENV=production
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["bun", "run", "--no-env-file", "server/index.js"]
`;
}

/** Renders the container context allowlist for backend and optional worker artifacts.
 * @param includeJobs - Whether worker artifacts belong to the build context.
 * @returns The existing minimal context allowlist excluding environment/state files.
 */
export function dockerignore(includeJobs = false): string {
  const jobs = includeJobs ? "!jobs.manifest.json\n!jobs/\n!jobs/**\n" : "";
  return `*
!Dockerfile
!.dockerignore
!manifest.json
!application.graph.json
!openapi.json
${jobs}!public/
!public/**
!server/
!server/index.js
.env
.env.*
.relkit/state
.relkit/observability
`;
}

/**
 * Bundles one staged server with a scoped process group and temporary module link.
 * @param serverDirectory - Owned staging directory containing the emitted entrypoint.
 * @param projectRoot - Root used by Bun resolution.
 * @param development - Whether to retain inline source maps.
 * @returns Lazy bundling requiring filesystem and subprocess authority.
 */
export const bundleServerEffect = Effect.fn("Project.bundleServer")(
  function* (serverDirectory: string, projectRoot: string, development = false) {
    const files = yield* CliFileSystem;
    const processes = yield* CliProcess;
    const runtimeModules = resolve(dirname(fileURLToPath(import.meta.url)), "../../node_modules");
    const moduleLink = join(serverDirectory, "node_modules");
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(files.symlink(runtimeModules, moduleLink), () =>
          cleanupEffect("build.moduleLink.remove", files.unlink(moduleLink)),
        );
        const externals = yield* cliTry("build.optionalPeers", () =>
          optionalAgentExternals(serverDirectory),
        );
        const child = yield* processes.run({
          command: process.execPath,
          args: [
            "build",
            "--target=bun",
            "--format=esm",
            ...externals,
            ...(development ? ["--sourcemap=inline"] : ["--minify", "--sourcemap=none"]),
            "--env=disable",
            `--outfile=${join(serverDirectory, "index.js")}`,
            join(serverDirectory, "index.ts"),
          ],
          cwd: projectRoot,
        });
        if (child.exitCode !== 0)
          return yield* cliTry("build.bundle", () => {
            throw new Error(
              child.stderr.trim() ||
                child.stdout.trim() ||
                "Unable to bundle the production server.",
            );
          });
      }),
    );
  },
  (effect, _serverDirectory: string, _projectRoot: string, _development = false) =>
    observeCli("build.bundleServer", effect),
);

/**
 * Bundles staged source at its public Promise boundary.
 * @param serverDirectory - Staged server directory.
 * @param projectRoot - Authored project root.
 * @param development - Whether to retain development maps.
 * @param signal - Optional cancellation that reaps the subprocess before unlinking.
 * @returns A Promise completing after bundling and scoped link cleanup.
 */
export function bundleServer(
  serverDirectory: string,
  projectRoot: string,
  development = false,
  signal?: AbortSignal,
): Promise<void> {
  return runCliEffect(
    bundleServerEffect(serverDirectory, projectRoot, development),
    Layer.merge(fileSystemLayer, processLayer).pipe(Layer.provideMerge(cleanupLayer)),
    signal,
  );
}
/** Detects optional agent peers that must remain external to the server bundle.
 * @param serverDirectory - Resolution root with the owned module link installed.
 * @returns Only the optional DeepAgents external when no contained peer resolves.
 */
function optionalAgentExternals(serverDirectory: string): string[] {
  try {
    const agents = Bun.resolveSync("@relkit/agents", serverDirectory);
    Bun.resolveSync("deepagents", dirname(agents));
    return [];
  } catch {
    // Ordinary agents do not need this optional peer. Keep installed peers bundled
    // so DeepAgents applications still run in containers without node_modules.
    return ["--external=deepagents"];
  }
}

/**
 * Rewrites compiler-authored relative imports for the published server location.
 * @param source - Original runtime manifest source.
 * @param projectRoot - Authored import resolution root.
 * @param sourceDirectory - Original manifest directory.
 * @param targetDirectory - Final server directory.
 * @returns Portable source preserving the established import-prefix replacement.
 */
export function rebaseManifest(
  source: string,
  projectRoot: string,
  sourceDirectory: string,
  targetDirectory: string,
): string {
  const sourcePrefix = manifestImportPrefix(sourceDirectory, projectRoot);
  const targetPrefix = manifestImportPrefix(targetDirectory, projectRoot);
  return source.replaceAll(`from "${sourcePrefix}`, `from "${targetPrefix}`);
}

/** Projects an expected build failure into its existing diagnostic message.
 * @param error - Original expected native/build failure.
 * @returns Its existing public diagnostic message.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Calculates the portable source import prefix relative to a generated manifest.
 * @param directory - Manifest location.
 * @param projectRoot - Authored import root.
 * @returns The portable relative source import prefix.
 */
function manifestImportPrefix(directory: string, projectRoot: string): string {
  const rootPath = relative(directory, projectRoot).replaceAll("\\", "/");
  return rootPath === "" ? "./" : `${rootPath}/`;
}

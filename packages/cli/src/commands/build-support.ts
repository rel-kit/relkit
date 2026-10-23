/**
 * Bundles a staged backend through owned filesystem and subprocess services and
 * rebases compiler manifest imports for publication. Temporary module links and
 * process groups share one scope, so failed or cancelled bundles cannot leak them.
 */
import { join, relative } from "node:path";
import { Effect, Layer } from "effect";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import { CliProcess, processLayer } from "../services/process.service.js";
import { cleanupLayer } from "../services/cleanup.service.js";
import { runBundleProcess } from "./build-bundle-process.js";
import { linkBuildModules } from "./build-module-links.js";
import { DependencySourceLive } from "@relkit/provider/internal/dependencies";

export { dockerfile, dockerignore } from "./build-container.js";

/**
 * Bundles one staged server with a scoped process group and temporary module link.
 * @param serverDirectory - Owned staging directory containing the emitted entrypoint.
 * @param projectRoot - Root used by Bun resolution.
 * @param development - Whether to retain inline source maps.
 * @param inventoryFile - Preparation inventory filename; enables sealed lazy chunks.
 * @returns Lazy bundling requiring filesystem and subprocess authority.
 */
export const bundleServerEffect = Effect.fn("Project.bundleServer")(
  function* (
    serverDirectory: string,
    projectRoot: string,
    development = false,
    inventoryFile?: "bun.inputs.json",
    external: readonly string[] = [],
  ) {
    const files = yield* CliFileSystem;
    const processes = yield* CliProcess;
    const moduleLink = join(serverDirectory, "node_modules");
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* linkBuildModules(files, moduleLink, projectRoot);
        yield* runBundleProcess(
          processes,
          serverDirectory,
          projectRoot,
          development,
          inventoryFile,
          external,
        );
      }),
    );
  },
  (
    effect,
    _serverDirectory: string,
    _projectRoot: string,
    _development = false,
    _inventoryFile?: "bun.inputs.json",
    _external: readonly string[] = [],
  ) => observeCli("build.bundleServer", effect),
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
    Layer.mergeAll(fileSystemLayer, processLayer, DependencySourceLive).pipe(
      Layer.provideMerge(cleanupLayer),
    ),
    signal,
  );
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
  return (
    source
      .replaceAll(`from "${sourcePrefix}`, `from "${targetPrefix}`)
      .replaceAll(`import("${sourcePrefix}`, `import("${targetPrefix}`)
      // Deferred imports encode slashes for script safety; preserve that encoding.
      .replaceAll(
        `import("${sourcePrefix.replaceAll("/", "\\u002F")}`,
        `import("${targetPrefix.replaceAll("/", "\\u002F")}`,
      )
  );
}

/** Projects an expected build failure into its existing diagnostic message.
 * @typeParam T - Original precise error input retained at the compatibility edge.
 * @param error - Original expected native/build failure.
 * @returns Its existing public diagnostic message.
 */
export function errorMessage<T>(error: T): string {
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

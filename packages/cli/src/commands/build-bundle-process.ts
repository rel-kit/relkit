/**
 * Bundles the staged server: `bun build` as a subprocess on Bun, esbuild in process on Node
 * (see `build-bundle-esbuild.ts`).
 */
import { join } from "node:path";
import { Effect } from "effect";
import { cliPromise, cliTry } from "../cli-errors.js";
import { runtime as cliRuntime } from "../runtime/index.js";
import { bundleWithEsbuild } from "./build-bundle-esbuild.js";
import type { ProcessCapabilities } from "../services/process.types.js";
import { HTTP_TRANSPORT_REQUIREMENTS } from "relkit/runtime-hono/prepared";
import type { RuntimeAdapterName } from "relkit/runtime";

/** Bundlers `relkit build` can run. */
export type Bundler = "bun" | "esbuild";

/** @returns `bun` on Bun, where `bun build` is available, and esbuild on Node. */
export function defaultBundler(): Bundler {
  return cliRuntime.name === "bun" ? "bun" : "esbuild";
}

/**
 * Bundles one emitted server and preserves the native diagnostic on failure.
 * @param processes - Scoped process owner captured by the build service.
 * @param directory - Staged server directory with its consumer module link.
 * @param root - Consuming project resolution context.
 * @param development - Whether to retain inline source maps.
 * @param inventory - Prepared capsule inventory filename and chunk selection.
 * @param external - Selected packages left external by the bundler.
 * @param runtime - Bundle target; Node bundles resolve Node built-ins instead of Bun's.
 * @param bundler - `bun build` (the default on Bun) or esbuild (the default on Node).
 * @returns Completion after the child and output readers have physically settled.
 */
export const runBundleProcess = Effect.fn("Project.bundleProcess")(function* (
  processes: ProcessCapabilities,
  directory: string,
  root: string,
  development: boolean,
  inventory?: "bun.inputs.json",
  external: readonly string[] = [],
  runtime: RuntimeAdapterName = "bun",
  bundler: Bundler = defaultBundler(),
) {
  const externalPackages = new Set([
    ...external,
    ...HTTP_TRANSPORT_REQUIREMENTS.map((entry) => entry.package),
    "@relkit/langchain",
    // The deprecated @relkit/app only re-exports relkit, so it stays external with it.
    ...(external.includes("relkit") ? ["@relkit/app"] : []),
  ]);
  const optionalLeaves = [
    "relkit/runtime-hono/mcp",
    "relkit/runtime-hono/ag-ui",
    "relkit/runtime-hono/scalar",
  ];
  const externals = [
    ...[...externalPackages].flatMap((name) => [name, `${name}/*`]),
    ...optionalLeaves,
  ];
  // A Worker cannot install packages beside its script, so its bundle includes them all; only the
  // optional transports the server imports by name stay external (and are unavailable there).
  if (runtime === "workers")
    return yield* cliPromise("build.bundle", () =>
      bundleWithEsbuild({ directory, root, development, external: optionalLeaves, runtime }),
    );
  if (bundler === "esbuild")
    return yield* cliPromise("build.bundle", () =>
      bundleWithEsbuild({
        directory,
        root,
        development,
        external: externals,
        runtime,
        ...(inventory === undefined ? {} : { inventory }),
      }),
    );
  const child = yield* processes.run({
    command: process.execPath,
    args: [
      "build",
      `--target=${runtime}`,
      "--format=esm",
      ...externals.map((name) => `--external=${name}`),
      ...(development ? ["--sourcemap=inline"] : ["--minify", "--sourcemap=none"]),
      "--env=disable",
      ...(inventory === undefined ? [] : [`--metafile=${join(directory, inventory)}`]),
      ...(inventory === undefined
        ? [`--outfile=${join(directory, "index.js")}`]
        : ["--splitting", `--outdir=${directory}`]),
      join(directory, "index.ts"),
    ],
    cwd: root,
  });
  if (child.exitCode !== 0)
    return yield* cliTry("build.bundle", () => {
      throw new Error(
        child.stderr.trim() || child.stdout.trim() || "Unable to bundle the production server.",
      );
    });
});

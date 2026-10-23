/** Runs the consumer-resolved bundle subprocess through captured process authority. */
import { join } from "node:path";
import { Effect } from "effect";
import { cliTry } from "../cli-errors.js";
import type { ProcessCapabilities } from "../services/process.types.js";
import { HTTP_TRANSPORT_REQUIREMENTS } from "@relkit/runtime-hono/internal/prepared";

/**
 * Bundles one emitted server and preserves the native diagnostic on failure.
 * @param processes - Scoped process owner captured by the build service.
 * @param directory - Staged server directory with its consumer module link.
 * @param root - Consuming project resolution context.
 * @param development - Whether to retain inline source maps.
 * @param inventory - Prepared capsule inventory filename and chunk selection.
 * @returns Completion after the child and output readers have physically settled.
 */
export const runBundleProcess = Effect.fn("Project.bundleProcess")(function* (
  processes: ProcessCapabilities,
  directory: string,
  root: string,
  development: boolean,
  inventory?: "bun.inputs.json",
  external: readonly string[] = [],
) {
  const externalPackages = new Set([
    ...external,
    ...HTTP_TRANSPORT_REQUIREMENTS.map((entry) => entry.package),
    "@relkit/langchain",
  ]);
  const optionalLeaves = [
    "@relkit/runtime-hono/mcp",
    "@relkit/runtime-hono/ag-ui",
    "@relkit/runtime-hono/scalar",
  ];
  const child = yield* processes.run({
    command: process.execPath,
    args: [
      "build",
      "--target=bun",
      "--format=esm",
      ...[...externalPackages].flatMap((name) => [`--external=${name}`, `--external=${name}/*`]),
      ...optionalLeaves.map((name) => `--external=${name}`),
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

/**
 * Bundles the production server with esbuild when the CLI runs on Node, where `bun build` is not
 * available. The options mirror the `bun build` invocation: one ES module (or split chunks when
 * a preparation inventory is requested), the same externals, inline source maps in development
 * and minified output otherwise. ES module output that reaches a CommonJS `require` gets one
 * from `createRequire`, which `bun build` provides on its own.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeName } from "relkit/runtime";

/** Bundle settings shared with the `bun build` path. */
export interface EsbuildBundleInput {
  readonly directory: string;
  readonly root: string;
  readonly development: boolean;
  readonly inventory?: "bun.inputs.json";
  readonly external: readonly string[];
  readonly runtime: RuntimeName;
}

const REQUIRE_BANNER =
  'import { createRequire as __relkitCreateRequire } from "node:module";\n' +
  "const require = __relkitCreateRequire(import.meta.url);";

/**
 * Runs esbuild for one staged server.
 * @param input - Staged directory, resolution root and bundle options.
 * @returns Completion; esbuild's formatted errors propagate as the thrown message.
 */
export async function bundleWithEsbuild(input: EsbuildBundleInput): Promise<void> {
  const { build } = await import("esbuild");
  const result = await build({
    absWorkingDir: input.root,
    entryPoints: [join(input.directory, "index.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    target: input.runtime === "node" ? "node22" : "esnext",
    // Bun builds keep Bun's export conditions; `bun:*` modules stay external either way.
    conditions: input.runtime === "bun" ? ["bun"] : [],
    external: [...input.external, "bun", "bun:*"],
    banner: { js: REQUIRE_BANNER },
    sourcemap: input.development ? "inline" : false,
    minify: !input.development,
    metafile: input.inventory !== undefined,
    logLevel: "silent",
    ...(input.inventory === undefined
      ? { outfile: join(input.directory, "index.js") }
      : { splitting: true, outdir: input.directory }),
  });
  if (input.inventory !== undefined && result.metafile !== undefined)
    await writeFile(join(input.directory, input.inventory), JSON.stringify(result.metafile));
}

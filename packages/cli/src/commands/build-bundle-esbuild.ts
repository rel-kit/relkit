/**
 * Bundles the production server with esbuild when the CLI runs on Node, where `bun build` is not
 * available. The options mirror the `bun build` invocation: one ES module (or split chunks when
 * a preparation inventory is requested), the same externals, inline source maps in development
 * and minified output otherwise. ES module output that reaches a CommonJS `require` gets one
 * from `createRequire`, which `bun build` provides on its own.
 *
 * A Workers bundle is built from `worker.ts` instead and includes every dependency: a Worker
 * cannot install packages beside its script. Only `node:*` modules (provided by Workers'
 * `nodejs_compat` flag, or polyfilled by wrangler) and the optional transports the server loads by
 * name stay external. Workers export conditions are preferred, `import.meta.url` is fixed because
 * a bundled Worker module has none, and the Bun and Node adapters that `relkit/runtime` selects at
 * run time are replaced by a stub, since a Worker always selects the Workers adapter.
 */
import { writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join } from "node:path";
import type { Plugin } from "esbuild";
import type { RuntimeAdapterName } from "relkit/runtime";

/** Bundle settings shared with the `bun build` path. */
export interface EsbuildBundleInput {
  readonly directory: string;
  readonly root: string;
  readonly development: boolean;
  readonly inventory?: "bun.inputs.json";
  readonly external: readonly string[];
  readonly runtime: RuntimeAdapterName;
}

/** URL a Workers bundle sees as its own; `nodejs_compat`'s virtual filesystem roots it at /bundle. */
export const WORKERS_MODULE_URL = "file:///bundle/server/index.js";

/** Replaces `relkit/runtime`'s lazy imports of the Bun and Node adapters in a Workers bundle. */
const tierOneAdapterStub: Plugin = {
  name: "relkit-workers-adapter-stub",
  setup(build) {
    // esbuild filters are Go regular expressions, which take no flags.
    build.onResolve({ filter: /^\.\/(bun|node)\/index\.js$/ }, (args) =>
      /[\\/]runtime[\\/]current-runtime\.(js|ts)$/u.test(args.importer)
        ? { path: args.path, namespace: "relkit-workers-stub" }
        : undefined,
    );
    build.onLoad({ filter: /.*/, namespace: "relkit-workers-stub" }, () => ({
      contents:
        'throw new Error("A Cloudflare Workers bundle only contains the Workers runtime adapter.");',
      loader: "js",
    }));
  },
};

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
  if (input.runtime === "workers") {
    await build({
      absWorkingDir: input.root,
      entryPoints: [join(input.directory, "worker.ts")],
      bundle: true,
      format: "esm",
      platform: "neutral",
      target: "es2024",
      mainFields: ["module", "main"],
      conditions: ["workerd", "worker"],
      external: ["node:*", ...builtinModules, ...input.external],
      plugins: [tierOneAdapterStub],
      define: { "import.meta.url": JSON.stringify(WORKERS_MODULE_URL) },
      sourcemap: input.development ? "inline" : false,
      // Not minified: wrangler bundles this file again, and minifying would fold the server's
      // non-literal imports of optional packages into literals that wrangler then must resolve.
      // Readable stack traces in Workers logs are a bonus; wrangler compresses the upload.
      minify: false,
      logLevel: "silent",
      outfile: join(input.directory, "index.js"),
    });
    return;
  }
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

/**
 * Builds the small packaged CLI executable with pinned Bun, targeting Node so it starts on Bun
 * and Node. Compilation and native publication are finite owned adapter calls. CLI dispatch
 * and the Node TypeScript hooks stay external dynamic imports, so the executable itself
 * neither parses nor evaluates its dependency graph.
 */
import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { Effect } from "effect";
import { ownedNativePromise, narrowEffectImportPlugin } from "@relkit/cli/tooling";

/**
 * Bundles one command boundary while keeping its documented lazy imports external.
 * @param entry - Repository-relative authored entrypoint.
 * @param destination - Repository-relative generated package artifact.
 * @param external - Exact lazy import specifiers preserved relative to the output entry.
 * @returns Completed self-contained Bun artifact; build failures never pass silently.
 */
export const packageDevBootstrap = Effect.fn("Packaging.devBootstrap")(function* (
  entry: string,
  destination: string,
  external: readonly string[],
) {
  const root = resolve(import.meta.dir, "..");
  const result = yield* ownedNativePromise("package.dev.build", () =>
    Bun.build({
      entrypoints: [resolve(root, entry)],
      // The executable runs on Bun and Node; a Node-target bundle runs on both.
      target: "node",
      format: "esm",
      minify: true,
      plugins: [lazyImports(external), narrowEffectImportPlugin()],
    }),
  );
  if (!result.success || result.outputs.length !== 1)
    return yield* Effect.die(new Error("Prepared development bootstrap packaging failed."));
  const output = result.outputs[0];
  if (output === undefined)
    return yield* Effect.die(new Error("Prepared bootstrap output is missing."));
  yield* ownedNativePromise("package.dev.write", () =>
    Bun.write(resolve(root, destination), output),
  );
  yield* ownedNativePromise("package.dev.remove-stale-map", () =>
    rm(resolve(root, destination) + ".map", { force: true }),
  );
});

/**
 * Keeps exact importer-relative lazy specifiers intact across Bun's resolver.
 * @param external - Audited relative imports whose modules are emitted separately by tsc.
 * @returns Pure bundler policy; it grants no runtime or filesystem authority.
 */
function lazyImports(external: readonly string[]): Bun.BunPlugin {
  return {
    name: "relkit-lazy-dev-imports",
    setup(builder) {
      builder.onResolve({ filter: /^\./ }, (args) => {
        if (external.includes(args.path)) return { path: args.path, external: true };
      });
    },
  };
}

/**
 * Packages the executable boundary after TypeScript has emitted its declarations.
 * @returns Joined finite build/publication; no server or support process is acquired.
 */
const main = Effect.gen(function* () {
  yield* packageDevBootstrap("packages/cli/src/bin.ts", "packages/cli/dist/bin.js", [
    "./main.js",
    // Registers the Node TypeScript hooks relative to its own module, so it stays a file.
    "./runtime/node/typescript-register.js",
  ]);
});

if (import.meta.main) await Effect.runPromise(Effect.scoped(main));

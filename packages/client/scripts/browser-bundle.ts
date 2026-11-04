/** Bundles the browser entries of @relkit/client and reports every Effect import they reach. */
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

/** Browser entries: everything a frontend imports, not the Bun-only server helpers. */
export const browserEntries = [
  "src/index.ts",
  "src/react/index.ts",
  "src/jobs/index.ts",
  "src/tanstack-query.ts",
] as const;

/** Peers a frontend installs itself; they are not part of the client's own code. */
const external = ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"];

/** One import of the Effect runtime found while bundling. */
export interface EffectImport {
  readonly specifier: string;
  readonly importer: string;
}

/**
 * Bundles the browser entries for a browser target and collects each module that imports
 * `effect` or an `effect/*` subpath, directly or through a dependency such as `relkit`.
 * @returns The Effect imports, the bundle size in bytes and the bundled module count.
 */
export async function analyzeBrowserBundle(): Promise<{
  readonly effectImports: readonly EffectImport[];
  readonly bytes: number;
  readonly modules: number;
}> {
  const effectImports: EffectImport[] = [];
  const modules = new Set<string>();
  const result = await Bun.build({
    entrypoints: browserEntries.map((entry) => resolve(root, entry)),
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
    external,
    throw: false,
    plugins: [
      {
        name: "effect-import-probe",
        setup(build) {
          build.onResolve({ filter: /^effect(\/.*)?$|^@effect\// }, (args) => {
            effectImports.push({
              specifier: args.path,
              importer: relative(resolve(root, "../.."), args.importer),
            });
            return undefined;
          });
          build.onLoad({ filter: /.*/ }, (args) => {
            modules.add(args.path);
            return undefined;
          });
        },
      },
    ],
  });
  if (!result.success)
    throw new AggregateError(result.logs, "The browser entries of @relkit/client did not bundle.");
  const bytes = result.outputs.reduce((total, output) => total + output.size, 0);
  return { effectImports, bytes, modules: modules.size };
}

if (import.meta.main) {
  const report = await analyzeBrowserBundle();
  console.log(
    `@relkit/client browser bundle: ${report.modules} modules, ${(report.bytes / 1024).toFixed(1)} KiB minified.`,
  );
  if (report.effectImports.length > 0) {
    for (const entry of report.effectImports) console.error(`${entry.importer} -> ${entry.specifier}`);
    process.exitCode = 1;
  }
}

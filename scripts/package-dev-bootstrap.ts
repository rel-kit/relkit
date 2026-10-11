/**
 * Builds small packaged executable/prepared-command closures with pinned Bun.
 * Compilation and native publication are finite owned adapter calls. Safe CLI
 * dispatch and compiler modules remain external dynamic imports, so unchanged
 * startup neither parses nor evaluates their dependency graph.
 */
import { resolve, relative } from "node:path";
import { readdir, rm } from "node:fs/promises";
import { Effect } from "effect";
import { ownedNativePromise, narrowEffectImportPlugin } from "@relkit/cli/internal/tooling";

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
      target: "bun",
      format: "esm",
      minify: true,
      external: ["@duckdb/node-api"],
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
 * Packages prepared policy and delayed support with a single shared Effect identity.
 * @returns Joined chunk publication; storage entries remain dynamic imports until support runs.
 */
const packagePreparedCohort = Effect.fn("Packaging.preparedCohort")(function* () {
  const root = resolve(import.meta.dir, "..");
  const destination = resolve(root, "packages/cli/dist/dev-snapshot");
  yield* removeStalePreparedChunks(destination);
  const hit = yield* buildPreparedEntries(
    root,
    destination,
    [
      "packages/cli/src/dev-snapshot/snapshot-command-entry.ts",
      "packages/cli/src/dev-snapshot/snapshot-hash-worker.ts",
      "packages/cli/src/commands/dev-telemetry-operation.ts",
      "packages/cli/src/commands/dev-telemetry-native.service.ts",
    ],
    "prepared-hit-[hash].js",
  );
  const preparation = yield* buildPreparedEntries(
    root,
    destination,
    ["packages/cli/src/dev-snapshot/snapshot-preparation-entry.ts"],
    "prepared-prepare-[hash].js",
  );
  if (!hit.success || !preparation.success || hit.outputs.length < 4)
    return yield* Effect.die(new Error("Prepared development cohort packaging failed."));
  const outputs = new Map(
    [...hit.outputs, ...preparation.outputs].map((output) => [output.path, output]),
  );
  for (const output of outputs.values()) {
    const path = relative(destination, output.path);
    if (path.startsWith("../") || path === ".." || path.startsWith("/"))
      return yield* Effect.die(new Error("Prepared chunk escaped its packaging destination."));
    yield* ownedNativePromise("package.dev.chunk", async () => {
      const bytes = await output.arrayBuffer();
      await Bun.write(output.path, bytes);
    });
    yield* ownedNativePromise("package.dev.remove-stale-map", () =>
      rm(output.path + ".map", { force: true }),
    );
  }
  yield* ownedNativePromise("package.dev.worker-entry", () =>
    Bun.write(
      resolve(destination, "duckdb-worker.js"),
      'import "@relkit/observability/internal/local-worker";\n',
    ),
  );
});

/** Builds one dependency-isolated prepared graph so preparation-only TypeScript stays off hits. */
const buildPreparedEntries = Effect.fn("Packaging.preparedEntries")(
  (root: string, destination: string, entries: readonly string[], chunk: string) =>
    ownedNativePromise("package.dev.cohort", () =>
      Bun.build({
        entrypoints: entries.map((entry) => resolve(root, entry)),
        outdir: destination,
        target: "bun",
        format: "esm",
        splitting: true,
        naming: { entry: "[name].js", chunk },
        minify: true,
        external: ["@duckdb/node-api", "@relkit/compiler"],
        plugins: [
          lazyImports([
            "../services/local-capabilities.js",
            "../commands/dev-local-compiler.js",
            "./dev-telemetry-operation.js",
            "./dev-telemetry-native.service.js",
          ]),
          narrowEffectImportPlugin(),
        ],
      }),
    ),
);

/** Removes only previous content-addressed cohort chunks before writing the next cohort. */
const removeStalePreparedChunks = Effect.fn("Packaging.removeStalePreparedChunks")(function* (
  destination: string,
) {
  const entries = yield* ownedNativePromise("package.dev.read-output-directory", () =>
    readdir(destination, { withFileTypes: true }),
  );
  yield* Effect.forEach(
    entries.filter(
      (entry) =>
        entry.isFile() &&
        /^prepared(?:-(?:hit|prepare))?-[a-z0-9]+\.js(?:\.map)?$/i.test(entry.name),
    ),
    (entry) =>
      ownedNativePromise("package.dev.remove-stale-chunk", () =>
        rm(resolve(destination, entry.name), { force: true }),
      ),
    { concurrency: 8 },
  );
});

/**
 * Packages both native boundaries after TypeScript has emitted their declarations.
 * @returns Joined finite build/publication; no server or support process is acquired.
 */
const main = Effect.gen(function* () {
  yield* packageDevBootstrap("packages/cli/src/bin.ts", "packages/cli/dist/bin.js", [
    "./main.js",
    "./dev-snapshot/snapshot-command-entry.js",
    "./dev-snapshot/snapshot-preparation-entry.js",
  ]);
  yield* packagePreparedCohort();
});

if (import.meta.main) await Effect.runPromise(Effect.scoped(main));

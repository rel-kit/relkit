/** Preserves contributor manifest rewrites, concrete fallbacks and serial workspace link registration before install. */
import { Context, Effect } from "effect";
import { join } from "node:path";
import { GeneratorPaths } from "./scaffolding/index.js";
import { CliFileSystem } from "./services/filesystem.service.js";
import { CliProcess } from "./services/process.service.js";
import { cliAdapterError } from "./cli-errors.js";
import { observeCli } from "./cli-runtime.js";
import type { ContributorRead, ContributorWorkspaceCapabilities } from "./contributor.types.js";
import cliManifest from "../package.json" with { type: "json" };
import { missing } from "./contributor-workspace-discovery.js";
export function makeContributorRewrite(
  repositoryRoot: string,
  read: ContributorRead,
  links: ContributorWorkspaceCapabilities["links"],
  files: Context.Service.Shape<typeof CliFileSystem>,
  paths: Context.Service.Shape<typeof GeneratorPaths>,
): ContributorWorkspaceCapabilities["rewrite"] {
  const rewrite: ContributorWorkspaceCapabilities["rewrite"] = Effect.fn("Contributor.rewrite")(
    (projectRoot: string) =>
      observeCli(
        "contributor.rewrite",
        Effect.gen(function* () {
          const path = join(projectRoot, "package.json");
          const manifest = yield* read(path);
          const resolved = yield* links(
            repositoryRoot,
            { ...manifest.dependencies, ...manifest.devDependencies },
            manifest.dependencies ?? {},
          );
          const dependencies = { ...manifest.dependencies };
          const devDependencies = { ...manifest.devDependencies };
          const fallbacks: Readonly<Record<string, string>> =
            cliManifest.relkit.buildCatalog.dependencies;
          for (const [name, version] of Object.entries(dependencies)) {
            const fallback = fallbacks[name];
            if (version !== `link:${name}` || resolved.has(name) || fallback === undefined)
              continue;
            dependencies[name] = fallback;
            const installed = join(projectRoot, "node_modules", name);
            const info = yield* paths
              .metadata(installed)
              .pipe(
                Effect.mapError((cause) => cliAdapterError("contributor.metadata", cause.cause)),
              );
            if (info?.kind === "symlink") yield* files.unlink(installed);
          }
          const names = [...resolved.keys()].sort();
          for (const name of names) {
            if (dependencies[name] !== undefined) dependencies[name] = `link:${name}`;
            else devDependencies[name] = `link:${name}`;
          }
          yield* files.writeText(
            path,
            `${JSON.stringify({ ...manifest, ...(manifest.dependencies === undefined && Object.keys(dependencies).length === 0 ? {} : { dependencies }), devDependencies }, null, 2)}\n`,
          );
          return names;
        }),
      ),
  );
  return rewrite;
}
export function makeContributorPrepare(
  repositoryRoot: string,
  read: ContributorRead,
  links: ContributorWorkspaceCapabilities["links"],
  rewrite: ContributorWorkspaceCapabilities["rewrite"],
  processes: Context.Service.Shape<typeof CliProcess>,
): ContributorWorkspaceCapabilities["prepare"] {
  const prepare: ContributorWorkspaceCapabilities["prepare"] = Effect.fn("Contributor.prepare")(
    (projectRoot: string) =>
      observeCli(
        "contributor.prepare",
        Effect.gen(function* () {
          const names = yield* rewrite(projectRoot);
          const manifest = yield* read(join(projectRoot, "package.json"));
          const resolved = yield* links(
            repositoryRoot,
            { ...manifest.dependencies, ...manifest.devDependencies },
            manifest.dependencies ?? {},
          );
          for (const name of names) {
            const path = resolved.get(name);
            if (path === undefined) return yield* missing(name);
            const result = yield* processes.run({
              command: process.execPath,
              args: ["link", "--silent"],
              cwd: path,
              maximumOutputBytes: Number.MAX_SAFE_INTEGER,
            });
            if (result.exitCode !== 0) return result;
          }
          return { exitCode: 0 };
        }),
      ),
  );
  return prepare;
}

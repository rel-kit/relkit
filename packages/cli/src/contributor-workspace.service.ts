import { dirname, join } from "node:path";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import { GeneratorPaths, generatorPathsLive, resolveCatalogVersion } from "create-relkit";
import { cliAdapterError, cliTry } from "./cli-errors.js";
import { observeCli } from "./cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "./services/filesystem.service.js";
import { CliProcess, processLayer } from "./services/process.service.js";
import { ContributorManifest } from "./contributor.schemas.js";
import type {
  ContributorTraversal,
  ContributorWorkspaceCapabilities,
} from "./contributor.types.js";
import cliManifest from "../package.json" with { type: "json" };

/** One invocation's contributor workspace authority; no shared cache or resource handles. */
export class ContributorWorkspace extends Context.Service<
  ContributorWorkspace,
  ContributorWorkspaceCapabilities
>()("relkit/cli/ContributorWorkspace") {}

/**
 * Binds workspace traversal to existing filesystem, path and process authorities.
 * @param repositoryRoot - Repository supplying workspace definitions and catalogs.
 * @returns A Layer whose infrastructure requirements remain explicit.
 */
export function contributorWorkspaceLive(repositoryRoot: string) {
  return Layer.effect(
    ContributorWorkspace,
    Effect.gen(function* () {
      const files = yield* CliFileSystem;
      const paths = yield* GeneratorPaths;
      const processes = yield* CliProcess;
      const read = Effect.fn("Contributor.read")((path: string) =>
        files
          .readText(path)
          .pipe(
            Effect.flatMap((text) =>
              cliTry("contributor.manifest", () =>
                Schema.decodeUnknownSync(ContributorManifest)(JSON.parse(text)),
              ),
            ),
          ),
      );
      const roots: ContributorWorkspaceCapabilities["roots"] = Effect.fn("Contributor.roots")(
        (root: string) =>
          observeCli(
            "contributor.roots",
            Effect.gen(function* () {
              const manifests = yield* files.files(root, [
                "packages/*/package.json",
                "integrations/packages/*/package.json",
                "integrations/catalog/package.json",
              ]);
              const entries = yield* Effect.forEach(
                manifests,
                (path) =>
                  Effect.gen(function* () {
                    const file = join(root, path);
                    const manifest = yield* read(file);
                    if (manifest.name === undefined)
                      return yield* cliTry("contributor.name", () => {
                        throw new Error(`Workspace package has no name: ${file}`);
                      });
                    return [manifest.name, dirname(file)] as const;
                  }),
                { concurrency: 4 },
              );
              return new Map(entries);
            }),
          ),
      );
      const links: ContributorWorkspaceCapabilities["links"] = Effect.fn("Contributor.links")(
        (root, direct, runtime) =>
          observeCli(
            "contributor.links",
            Effect.gen(function* () {
              const workspaces = yield* roots(root);
              const catalog = yield* read(join(root, "package.json"));
              const state = yield* Ref.make<ContributorTraversal>({
                pending: Object.keys(direct).filter((name) => name.startsWith("@relkit/")),
                links: new Map(),
              });
              for (;;) {
                const current = yield* Ref.get(state);
                const name = current.pending.at(-1);
                if (name === undefined) return current.links;
                yield* Ref.update(state, (value) => ({
                  ...value,
                  pending: value.pending.slice(0, -1),
                }));
                if (current.links.has(name)) continue;
                const path = workspaces.get(name);
                if (path === undefined) return yield* missing(name);
                yield* Ref.update(state, (value) => ({
                  ...value,
                  links: new Map([...value.links, [name, path]]),
                }));
                const manifest = yield* read(join(path, "package.json"));
                for (const dependency of Object.keys(manifest.dependencies ?? {})) {
                  if (dependency.startsWith("@relkit/")) {
                    yield* Ref.update(state, (value) => ({
                      ...value,
                      pending: [...value.pending, dependency],
                    }));
                  } else if (
                    name !== "@relkit/cli" &&
                    runtime[dependency] !== undefined &&
                    !(yield* Ref.get(state)).links.has(dependency)
                  ) {
                    const shared = yield* paths
                      .realpath(join(path, "node_modules", dependency))
                      .pipe(
                        Effect.mapError((cause) =>
                          cliAdapterError("contributor.realpath", cause.cause),
                        ),
                      );
                    const installed = yield* read(join(shared, "package.json"));
                    const version = yield* cliTry("contributor.catalog", () =>
                      resolveCatalogVersion(catalog, dependency, runtime[dependency]),
                    );
                    if (version === installed.version || version === `link:${dependency}`)
                      yield* Ref.update(state, (value) => ({
                        ...value,
                        links: new Map([...value.links, [dependency, shared]]),
                      }));
                  }
                }
              }
            }),
          ),
      );
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
                    Effect.mapError((cause) =>
                      cliAdapterError("contributor.metadata", cause.cause),
                    ),
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
      return ContributorWorkspace.of({ roots, links, rewrite, prepare });
    }),
  );
}

/**
 * Supplies native adapters once for a contributor invocation.
 * @param root - Repository containing workspace packages.
 * @returns The contributor service and its captured native authorities.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * const roots = await Effect.runPromise(
 *   Effect.flatMap(ContributorWorkspace, service => service.roots("/repo"))
 *     .pipe(Effect.provide(contributorWorkspaceLayer("/repo"))),
 * );
 * ```
 */
export function contributorWorkspaceLayer(root: string) {
  return contributorWorkspaceLive(root).pipe(
    Layer.provideMerge(Layer.mergeAll(fileSystemLayer, generatorPathsLive, processLayer)),
  );
}

/**
 * Preserves the existing missing-workspace diagnostic in the typed channel.
 * @param name - Required first-party package name.
 * @returns A failure retaining the original public Error message.
 */
function missing(name: string) {
  return cliTry("contributor.workspace", () => {
    throw new Error(`Workspace package not found: ${name}`);
  });
}

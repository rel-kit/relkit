/** Traverses first-party dependencies in the original stack order and links only matching installed native runtime versions. */
import { Context, Effect, Ref } from "effect";
import { join } from "node:path";
import { GeneratorPaths, resolveCatalogVersion } from "./scaffolding/index.js";
import { cliAdapterError, cliTry } from "./cli-errors.js";
import { observeCli } from "./cli-runtime.js";
import type {
  ContributorRead,
  ContributorTraversal,
  ContributorWorkspaceCapabilities,
  ContributorPackage,
} from "./contributor.types.js";
import { missing } from "./contributor-workspace-discovery.js";
export function makeContributorLinks(
  roots: ContributorWorkspaceCapabilities["roots"],
  read: ContributorRead,
  paths: Context.Service.Shape<typeof GeneratorPaths>,
): ContributorWorkspaceCapabilities["links"] {
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
            const current = yield* popContributorPending(state);
            const name = current.pending.at(-1);
            if (name === undefined) return current.links;
            if (current.links.has(name)) continue;
            const path = workspaces.get(name);
            if (path === undefined) return yield* missing(name);
            yield* Ref.update(state, (value) => ({
              ...value,
              links: new Map([...value.links, [name, path]]),
            }));
            const manifest = yield* read(join(path, "package.json"));
            for (const dependency of new Set([
              ...Object.keys(manifest.dependencies ?? {}),
              ...Object.keys(manifest.peerDependencies ?? {}).filter(
                (peer) => !peer.startsWith("@relkit/"),
              ),
            ])) {
              if (dependency.startsWith("@relkit/")) {
                yield* enqueueContributorDependency(state, dependency);
              } else if (
                name !== "@relkit/cli" &&
                !["next", "react", "react-dom"].includes(dependency) &&
                runtime[dependency] !== undefined &&
                !(yield* Ref.get(state)).links.has(dependency)
              ) {
                yield* linkSharedRuntime(paths, read, catalog, dependency, runtime, path, state);
              }
            }
          }
        }),
      ),
  );
  return links;
}

/** Appends a first-party dependency at the same traversal stack position. */
function enqueueContributorDependency(state: Ref.Ref<ContributorTraversal>, dependency: string) {
  return Ref.update(state, (value) => ({ ...value, pending: [...value.pending, dependency] }));
}

/** Returns the same pre-pop snapshot while removing one pending entry in the original Ref order. */
const popContributorPending = Effect.fn("Contributor.popPending")(function* (
  state: Ref.Ref<ContributorTraversal>,
) {
  const current = yield* Ref.get(state);
  if (current.pending.at(-1) !== undefined)
    yield* Ref.update(state, (value) => ({ ...value, pending: value.pending.slice(0, -1) }));
  return current;
});

const linkSharedRuntime = Effect.fn("Contributor.sharedRuntime")(function* (
  paths: Context.Service.Shape<typeof GeneratorPaths>,
  read: ContributorRead,
  catalog: ContributorPackage,
  dependency: string,
  runtime: Readonly<Record<string, string>>,
  path: string,
  state: Ref.Ref<ContributorTraversal>,
) {
  const shared = yield* paths
    .realpath(join(path, "node_modules", dependency))
    .pipe(Effect.mapError((cause) => cliAdapterError("contributor.realpath", cause.cause)));
  const installed = yield* read(join(shared, "package.json"));
  const version = yield* cliTry("contributor.catalog", () =>
    resolveCatalogVersion(catalog, dependency, runtime[dependency]),
  );
  if (version === installed.version || version === `link:${dependency}`)
    yield* Ref.update(state, (value) => ({
      ...value,
      links: new Map([...value.links, [dependency, shared]]),
    }));
});

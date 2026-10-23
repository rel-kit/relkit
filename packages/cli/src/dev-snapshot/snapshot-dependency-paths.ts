/** Groups consumed package paths and selected external package metadata without loading exports. */
import { isAbsolute, join, relative } from "node:path";
import { Effect, Schema } from "effect";
import type { DependencySourceContract } from "@relkit/provider/internal/dependencies";
import { SnapshotPath } from "./snapshot.schemas.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { resolveProductionDependency } from "../services/production-dependency-source.js";

/** Preserves native nested package roots and rejects environment or escaped bundle members. */
export const groupSnapshotDependencyPaths = Effect.fn("DevSnapshot.dependencyPaths")(function* (
  root: string,
  paths: readonly string[],
  allowExternal: boolean,
) {
  const groups = new Map<string, Set<string>>();
  const external: string[] = [];
  for (const nativePath of paths) {
    const path = (isAbsolute(nativePath) ? relative(root, nativePath) : nativePath).replaceAll(
      "\\",
      "/",
    );
    if (!Schema.is(SnapshotPath)(path)) {
      if (!allowExternal) return yield* ineligible("dependencies.path");
      external.push(nativePath);
      continue;
    }
    if (path.split("/").some((segment) => segment === ".env" || segment.startsWith(".env.")))
      return yield* ineligible("dependencies.environment");
    if (!path.startsWith("node_modules/")) continue;
    const marker = path.lastIndexOf("node_modules/") + "node_modules/".length;
    const segments = path.slice(marker).split("/");
    const packageLength = segments[0]?.startsWith("@") ? 2 : 1;
    if (segments.length <= packageLength) return yield* ineligible("dependencies.packagePath");
    const packageRoot = path.slice(0, marker) + segments.slice(0, packageLength).join("/");
    const members = groups.get(packageRoot) ?? new Set(["package.json"]);
    members.add(path.slice(packageRoot.length + 1));
    groups.set(packageRoot, members);
  }
  if (groups.size > 2_048) return yield* ineligible("dependencies.packageBound");
  return { groups, external };
});

/** Includes external selected identities that Bun deliberately leaves out of its input inventory. */
export const selectedManifestPaths = Effect.fn("DevSnapshot.selectedManifestPaths")(function* (
  source: DependencySourceContract | undefined,
  root: string,
  selected: Readonly<Record<string, string>>,
) {
  const paths: string[] = [];
  for (const [name, version] of Object.entries(selected)) {
    if (source === undefined) return yield* ineligible("dependencies.selectionAuthority");
    const identity = yield* resolveProductionDependency(source, name, root).pipe(
      Effect.mapError(() => ineligible("dependencies.selectionResolution")),
    );
    if (identity === null || identity.version !== version)
      return yield* ineligible("dependencies.selectionChanged");
    paths.push(join(identity.root, "package.json"));
  }
  return paths;
});

/**
 * Keeps unsafe dependency inventory failures in the existing safe fallback channel.
 * @param operation - Stable validation-operation label retained in the fallback diagnostic.
 * @returns An ineligible snapshot rejection preserving the existing compiler fallback channel.
 */
function ineligible(operation: string) {
  return new DevSnapshotRejected({ reason: "ineligible", operation });
}

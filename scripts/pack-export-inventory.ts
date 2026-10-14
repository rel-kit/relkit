/** Selects the exact first-party dependency closure and packs only the public resolver fixture's required packages. */
import { resolve } from "node:path";
import { Effect } from "effect";
import { workspacePackageDirectories } from "./workspace-packages.js";
import { loadReleaseTarballs } from "./pack-and-smoke-create-relkit-pack.js";
import {
  assertExportManifest,
  readExportManifest,
  exportNative,
  packExportPackage,
} from "./pack-export-native.js";
import { PackageExportFailure } from "./pack-export.errors.js";
import type { ExportInventory, ExportCommand } from "./pack-export.types.js";

/**
 * Inventories native manifests and checks their exact public package contracts.
 * @param repository - Read-only contributor repository.
 * @returns Complete workspace metadata and required transitive closure.
 */
export const exportInventory = Effect.fn("ExportSmoke.inventory")(function* (repository: string) {
  const directories = workspacePackageDirectories(repository);
  const manifests: ExportInventory["manifests"] = new Map();
  const requiredNames = new Set(["@relkit/app", "@relkit/compiler"]);
  const integrationNames = new Set<string>();
  for (const directory of directories) {
    const manifest = yield* readExportManifest(directory);
    yield* Effect.try({
      try: () => assertExportManifest(repository, directory, manifest),
      catch: (cause) =>
        new PackageExportFailure({
          operation: "manifest.contract",
          cause: new Error("Export contract failed", { cause }),
        }),
    });
    if (manifest.name === undefined) continue;
    manifests.set(manifest.name, manifest);
    const path = directory.slice(repository.length + 1);
    if (path.startsWith("integrations/")) requiredNames.add(manifest.name);
    if (path.startsWith("integrations/packages/")) integrationNames.add(manifest.name);
  }
  for (const name of requiredNames)
    for (const dependency of Object.keys(manifests.get(name)?.dependencies ?? {}))
      if (manifests.has(dependency)) requiredNames.add(dependency);
  return { directories, manifests, requiredNames, integrationNames } satisfies ExportInventory;
});

/**
 * Uses the explicit release tarballs when supplied, otherwise builds each required package.
 * @param run - Captured scoped native command capability.
 * @param inventory - Validated native workspace metadata.
 * @param artifactRoot - Outer scope-owned build output.
 * @returns Required package names mapped to exact tarballs.
 */
export const exportTarballs = Effect.fn("ExportSmoke.tarballs")(function* (
  run: ExportCommand,
  inventory: ExportInventory,
  artifactRoot: string,
) {
  const index = process.argv.indexOf("--artifacts");
  const requested = index < 0 ? undefined : process.argv[index + 1];
  if (index >= 0 && requested === undefined)
    return yield* new PackageExportFailure({
      operation: "arguments.artifacts",
      cause: new Error("--artifacts requires a directory"),
    });
  let supplied: Map<string, string> | undefined;
  if (requested !== undefined)
    supplied = yield* exportNative("release.artifacts", () =>
      loadReleaseTarballs(resolve(requested)),
    );
  const tarballs = new Map<string, string>();
  for (const directory of inventory.directories) {
    const manifest = yield* readExportManifest(directory);
    if (manifest.name === undefined || !inventory.requiredNames.has(manifest.name)) continue;
    let tarball = supplied?.get(manifest.name);
    if (supplied !== undefined && tarball === undefined)
      return yield* new PackageExportFailure({
        operation: "release.artifact",
        cause: new Error("Missing required release tarball"),
      });
    if (tarball === undefined) tarball = yield* packExportPackage(run, directory, artifactRoot);
    tarballs.set(manifest.name, tarball);
  }
  return tarballs;
});

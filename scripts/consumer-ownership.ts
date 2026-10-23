/**
 * Inventories every root/package/app/starter manifest and its third-party edges.
 * Existing workspace/catalog readers remain authoritative. Emitted declaration
 * references are observations of current dist bytes, independently of packing.
 */
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { Effect, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { workspacePackageDirectories } from "./workspace-packages.js";
import { resolveCatalogVersion } from "./catalog-manifest.js";
import { inspectionNative } from "./consumer-installation-native.js";
import { declarationReferences } from "./consumer-declaration-references.js";
import { OwnershipManifest } from "./consumer-ownership.schemas.js";
import { dependencyOwner } from "./consumer-ownership-policy.js";
import type {
  DependencyOwner,
  ManifestOwnership,
  OwnershipManifest as Manifest,
} from "./consumer-ownership.types.js";

/**
 * Decodes one source manifest including entrypoints and catalog declarations.
 * @param directory - Source package root.
 * @returns Lazy decoded manifest with read/decode failures preserved.
 */
const readManifest = Effect.fn("ConsumerOwnership.manifest")(function* (directory: string) {
  const text = yield* inspectionNative("ownership.manifest", () =>
    readFile(join(directory, "package.json"), "utf8"),
  );
  const raw = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
  )(text);
  // The embedded editor manifest selects a module format and has no package name.
  return yield* Schema.decodeUnknownEffect(OwnershipManifest)({ name: directory, ...raw });
});

/**
 * Names the non-overlapping measurement category of a source package.
 * @param path - Repository-relative package directory.
 * @returns Tooling, documentation, inspector, starter or published consumer scope.
 */
function category(path: string): ManifestOwnership["category"] {
  if (path === "") return "tooling";
  if (path === "packages/cli/editor") return "tooling";
  if (path === "apps/docs") return "documentation";
  if (path === "apps/inspector") return "inspector";
  if (path.startsWith("templates/")) return "starter";
  return "consumer";
}

/**
 * Classifies every direct external dependency while preserving declaration evidence.
 * @param manifest - Source package declaration.
 * @param root - Authoritative workspace catalog.
 * @param path - Repository-relative source manifest path.
 * @param references - Observed emitted declaration references.
 * @returns Sorted source ownership rows; these are not installed package counts.
 */
function ownershipRows(
  manifest: Manifest,
  root: Manifest,
  path: string,
  references: ReadonlyMap<string, string[]>,
): DependencyOwner[] {
  const rows: DependencyOwner[] = [];
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const)
    for (const [dependency, spec] of Object.entries(manifest[field] ?? {})) {
      if (
        dependency.startsWith("@relkit/") ||
        dependency === "create-relkit" ||
        dependency === "relkit"
      )
        continue;
      let role: DependencyOwner["role"] = "runtime";
      if (field === "devDependencies") role = "development";
      if (field === "optionalDependencies") role = "platform-or-optional";
      if (field === "peerDependencies")
        role =
          manifest.peerDependenciesMeta?.[dependency]?.optional === true ? "optional-peer" : "peer";
      rows.push({
        consumer: manifest.name,
        manifest: path,
        dependency,
        version: resolveCatalogVersion(root, dependency, spec),
        field,
        role,
        ...dependencyOwner(dependency, manifest.name, field === "devDependencies"),
        declarationReferences: [...new Set(references.get(dependency) ?? [])].sort(),
      });
    }
  return rows;
}

/**
 * Reads all maintained manifest roots and records direct third-party ownership.
 * @param root - Framework checkout used only as source inventory.
 * @returns Lazy inventory with exact entrypoints and build/script producers.
 */
export const inventoryConsumerOwnership = Effect.fn("ConsumerOwnership.inventory")(
  function* (root: string) {
    const directories = [root, ...workspacePackageDirectories(root)];
    for (const parent of ["apps", "examples", "templates/default/v1"] as const) {
      const entries = yield* inspectionNative("ownership.directories", () =>
        readdir(join(root, parent), { withFileTypes: true }),
      );
      for (const entry of entries)
        if (entry.isDirectory()) directories.push(join(root, parent, entry.name));
    }
    directories.push(join(root, "packages/cli/editor"));
    const rootManifest = yield* readManifest(root),
      records: ManifestOwnership[] = [];
    for (const directory of directories.sort()) {
      const manifest = yield* readManifest(directory);
      const references = yield* declarationReferences(directory);
      const path = relative(root, join(directory, "package.json"));
      records.push({
        path,
        category: category(relative(root, directory)),
        manifest,
        dependencies: ownershipRows(manifest, rootManifest, path, references),
      });
    }
    return records;
  },
  (effect) => observeExecution("testing", "consumer.ownership", effect),
);

import { resolveCatalogVersion } from "create-relkit/catalog-resolution";
export { resolveCatalogVersion } from "create-relkit/catalog-resolution";
import type { CatalogManifest, DependencyFields } from "./catalog-manifest.types.js";
export type { CatalogManifest, DependencyFields } from "./catalog-manifest.types.js";

export const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

/**
 * Narrows exact semantic versions used for external dependency pins.
 * @param value - Dependency or catalog version to inspect.
 * @returns Whether the value is one exact semantic version, including prereleases.
 */
export function exactVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      value,
    )
  );
}

function record(value: unknown, label: string): CatalogManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as CatalogManifest;
}

/**
 * Validates the root default catalog's exact dependency pins.
 * @param manifest - Root package manifest containing the authoritative catalog.
 * @returns A concrete dependency map.
 * @throws When a default catalog entry is absent or is a range or protocol.
 */
export function defaultCatalog(manifest: CatalogManifest): Record<string, string> {
  const catalog = record(manifest.catalog, "Default catalog");
  const result: Record<string, string> = {};
  for (const [name, version] of Object.entries(catalog)) {
    if (!exactVersion(version)) throw new Error(`Default catalog entry is not exact: ${name}`);
    result[name] = version;
  }
  return result;
}

/**
 * Resolves dependency fields without changing their source manifest.
 * @param manifest - Package manifest whose declarations will be resolved.
 * @param rootManifest - Root manifest that owns catalog references.
 * @returns Concrete maps for all four dependency fields.
 */
export function resolveDependencyFields(
  manifest: CatalogManifest,
  rootManifest: CatalogManifest,
): DependencyFields {
  return Object.fromEntries(
    dependencyFields.map((field) => [
      field,
      Object.fromEntries(
        Object.entries(record(manifest[field] ?? {}, field)).map(([name, spec]) => [
          name,
          resolveCatalogVersion(rootManifest, name, spec),
        ]),
      ),
    ]),
  ) as DependencyFields;
}

/**
 * Checks that a tarball preserves all resolved dependency and peer declarations.
 * @param source - Source package manifest.
 * @param packed - Actual package manifest read from its tarball.
 * @param rootManifest - Root manifest that owns source catalogs.
 * @param workspaceNames - First-party package names that resolve to the release.
 * @param version - Exact first-party release version.
 * @returns Nothing when every dependency field matches.
 * @throws When an entry is missing, added, unresolved, or changed during packing.
 */
export function assertPackedDependencies(
  source: CatalogManifest,
  packed: CatalogManifest,
  rootManifest: CatalogManifest,
  workspaceNames: ReadonlySet<string>,
  version: string,
): void {
  const expected = resolveDependencyFields(source, rootManifest);
  const actual = resolveDependencyFields(packed, {});
  for (const field of dependencyFields) {
    for (const [name, spec] of Object.entries(expected[field])) {
      const resolved = workspaceNames.has(name) ? version : spec;
      if (actual[field][name] !== resolved)
        throw new Error(
          `Packed dependency mismatch: ${source.name} -> ${name}@${actual[field][name]}`,
        );
    }
    if (Object.keys(actual[field]).length !== Object.keys(expected[field]).length)
      throw new Error(`Packed dependency field mismatch: ${source.name}.${field}`);
  }
}

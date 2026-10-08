import type { CatalogManifest } from "./catalog-resolution.types.js";
export type { CatalogManifest } from "./catalog-resolution.types.js";

/**
 * Narrows a required catalog object.
 * @param value - Parsed package manifest field.
 * @param label - Human-readable ownership description.
 * @returns The catalog record.
 * @throws When the field is absent, scalar, or an array.
 */
function record(value: unknown, label: string): CatalogManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as CatalogManifest;
}

/**
 * Resolves one dependency against its owning default or named Bun catalog.
 * @param manifest - Workspace root manifest that declares the catalogs.
 * @param name - Dependency name whose catalog entry is required.
 * @param spec - Concrete version or catalog reference to resolve.
 * @returns The concrete declaration, preserving supported peer ranges.
 * @throws When the reference, catalog, or catalog entry is missing or recursive.
 */
export function resolveCatalogVersion(
  manifest: CatalogManifest,
  name: string,
  spec: unknown,
): string {
  if (typeof spec !== "string" || spec.trim() === "")
    throw new Error(`Invalid dependency version: ${name}@${String(spec)}`);
  if (!spec.startsWith("catalog:")) return spec;
  const catalogName = spec.slice("catalog:".length).trim();
  const workspaces =
    manifest.workspaces !== null &&
    typeof manifest.workspaces === "object" &&
    !Array.isArray(manifest.workspaces)
      ? (manifest.workspaces as CatalogManifest)
      : {};
  const catalog = record(
    catalogName === ""
      ? (manifest.catalog ?? workspaces.catalog)
      : record(manifest.catalogs ?? workspaces.catalogs, "Named catalogs")[catalogName],
    catalogName === "" ? "Default catalog" : `Catalog ${catalogName}`,
  );
  const version = catalog[name];
  if (
    typeof version !== "string" ||
    version.trim() === "" ||
    /^[A-Za-z][A-Za-z\d+.-]*:/.test(version) ||
    /^(?:\.\.?\/|\/)/.test(version)
  )
    throw new Error(`Missing or invalid catalog entry: ${spec} -> ${name}`);
  return version;
}

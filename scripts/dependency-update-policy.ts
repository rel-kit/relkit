/** Resolves npm security updates back to the Bun catalog and restricts the generated files that CI may propose. */
import assert from "node:assert/strict";
import type { DependencyManifestData, ManifestChange } from "./dependency-update.types.js";

const fields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

/**
 * Promotes changed catalog-owned pins without silently choosing between conflicting proposals.
 * @param base - Catalog before the dependency PR.
 * @param head - Catalog already proposed by the PR.
 * @param changes - Active manifest changes; archived evidence is excluded by the caller.
 * @returns The exact catalog to synchronize, or throws for conflicting/ranged proposals.
 */
export function catalogUpdates(
  base: Readonly<Record<string, string>>,
  head: Readonly<Record<string, string>>,
  changes: readonly ManifestChange[],
): Record<string, string> {
  const result = { ...head };
  for (const { before, after } of changes) {
    for (const field of fields) {
      for (const [name, version] of Object.entries(after[field] ?? {})) {
        const previous = before[field]?.[name];
        if (!base[name] || previous === version || version.startsWith("catalog:")) continue;
        if (previous !== base[name] && previous !== "catalog:") continue;
        assert.match(
          version,
          /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
          `Catalog update must be exact: ${name}`,
        );
        assert.ok(
          result[name] === base[name] || result[name] === version,
          `Conflicting catalog updates: ${name}`,
        );
        result[name] = version;
      }
    }
  }
  return result;
}

/**
 * Restores catalog references that an npm updater replaced with concrete proposals.
 * @param before - Original manifest declaring dependency ownership.
 * @param after - Proposed manifest whose versions have already been admitted into the catalog.
 * @returns Dependency fields that continue to follow future catalog updates.
 */
export function catalogReferences(
  before: DependencyManifestData,
  after: DependencyManifestData,
): DependencyManifestData {
  const result = { ...after };
  for (const field of fields) {
    const dependencies = after[field];
    if (!dependencies) continue;
    result[field] = Object.fromEntries(
      Object.entries(dependencies).map(([name, version]) => [
        name,
        before[field]?.[name] === "catalog:" ? "catalog:" : version,
      ]),
    );
  }
  return result;
}

/**
 * Limits automatic corrections to known dependency data and one generated literal module.
 * @param path - Repository-relative Git path, never a filesystem path supplied to extraction.
 * @returns Whether this is an admitted normalization target; existence is checked separately.
 */
export function dependencyUpdatePath(path: string): boolean {
  return (
    path === "package.json" ||
    path === "bun.lock" ||
    /^(?:packages\/[a-z0-9-]+|integrations\/catalog|integrations\/packages\/[a-z0-9-]+|apps\/[a-z0-9-]+|examples\/[a-z0-9-]+|templates\/default\/v1\/[a-z0-9-]+)\/package\.json$/.test(
      path,
    ) ||
    path === "integrations/packages/effect-mq/src/build-catalog.ts"
  );
}

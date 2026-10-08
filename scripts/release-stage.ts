import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { defaultCatalog, type CatalogManifest } from "./catalog-manifest.js";

/**
 * Materializes catalogs, overrides, and patch assets before staging installation.
 * @param source - Repository root that owns the referenced patch assets.
 * @param staging - Temporary release workspace root.
 * @param manifest - Authoritative root package manifest.
 * @returns When the staged manifest and every relative patch asset are available.
 * @throws When a patch path is missing, absolute, or escapes either root.
 */
export async function stageReleaseRoot(
  source: string,
  staging: string,
  manifest: CatalogManifest,
): Promise<void> {
  defaultCatalog(manifest);
  const staged = {
    private: true,
    workspaces: ["packages/*"],
    packageManager: manifest.packageManager,
    catalog: manifest.catalog,
    catalogs: manifest.catalogs,
    overrides: manifest.overrides,
    patchedDependencies: manifest.patchedDependencies,
  };
  await writeFile(join(staging, "package.json"), `${JSON.stringify(staged, null, 2)}\n`);
  const patches = manifest.patchedDependencies ?? {};
  if (patches === null || typeof patches !== "object" || Array.isArray(patches))
    throw new Error("patchedDependencies must be an object.");
  for (const [name, path] of Object.entries(patches)) {
    if (typeof path !== "string" || path === "" || isAbsolute(path))
      throw new Error(`Patch path must be relative: ${name}`);
    const target = resolve(staging, path);
    const sourcePath = resolve(source, path);
    for (const [base, candidate] of [
      [staging, target],
      [source, sourcePath],
    ] as const) {
      const entry = relative(base, candidate);
      if (entry === "" || entry === ".." || entry.startsWith("../"))
        throw new Error(`Patch path escapes the release root: ${name}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await cp(sourcePath, target);
  }
}

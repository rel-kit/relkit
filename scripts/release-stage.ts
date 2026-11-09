import { existsSync, readdirSync, readFileSync } from "node:fs";
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
    // Private tool packages, such as relkit-typescript, resolve published packages' dev workspace
    // dependencies; they are never packed.
    workspaces: ["packages/*", "tools/*"],
    packageManager: manifest.packageManager,
    catalog: manifest.catalog,
    catalogs: manifest.catalogs,
    overrides: manifest.overrides,
    patchedDependencies: manifest.patchedDependencies,
  };
  await writeFile(join(staging, "package.json"), `${JSON.stringify(staged, null, 2)}\n`);
  if (existsSync(join(source, "tools")))
    await cp(join(source, "tools"), join(staging, "tools"), {
      recursive: true,
      filter: (path) => !/(?:^|\/)node_modules(?:\/|$)/.test(relative(source, path)),
    });
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

/**
 * Lists the private tool packages a release resolves dev workspace dependencies against.
 * @param source - Repository root.
 * @returns Package name to version for each `tools/*` package; none are packed.
 */
export function toolPackageVersions(source: string): ReadonlyMap<string, string> {
  const tools = join(source, "tools");
  if (!existsSync(tools)) return new Map();
  return new Map(
    readdirSync(tools, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(tools, entry.name, "package.json")))
      .map((entry) => {
        const manifest = JSON.parse(
          readFileSync(join(tools, entry.name, "package.json"), "utf8"),
        ) as { readonly name: string; readonly version: string };
        return [manifest.name, manifest.version] as const;
      }),
  );
}

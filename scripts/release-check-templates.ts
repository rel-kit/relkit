import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  digest,
  packageFields,
  readJson,
  root,
  stable,
  type RecordValue,
} from "./release-check-support.js";
import { expectedTemplateScripts, packedTemplates } from "./release-templates.js";
import { resolveCatalogVersion } from "./catalog-manifest.js";

/**
 * Checks standalone template contracts and hashes their complete source trees.
 * @param versions - Exact first-party package versions.
 * @param rootManifest - Root manifest owning tooling catalogs.
 * @returns Deterministic template file counts and hashes.
 * @throws When scripts, versions (including the Scalar peer pinned by runtime-hono), or
 * application import boundaries diverge.
 */
export async function templateInputs(
  versions: ReadonlyMap<string, string>,
  rootManifest: RecordValue,
): Promise<RecordValue[]> {
  const result: RecordValue[] = [];
  const scalar = (await readJson(join(root, "packages/relkit/package.json"))).peerDependencies?.[
    "@scalar/hono-api-reference"
  ];
  const forbidden =
    /(?:from|import)\s*["'](?:effect|hono|next|@pulumi\/|@aws-sdk\/|@relkit\/(?:cli|aws\/cloud-aws|pulumi\/engine)|relkit\/(?:engine|graph|runtime-effect|runtime-hono|providers-local|deploy|observability|inspector-api))["']/;
  const fullstackForbidden =
    /(?:from|import)\s*["'](?:effect|hono|@pulumi\/|@aws-sdk\/|@relkit\/(?:cli|aws\/cloud-aws|pulumi\/engine)|relkit\/(?:engine|graph|runtime-effect|runtime-hono|providers-local|deploy|observability|inspector-api))["']/;
  for (const name of packedTemplates) {
    const directory = join(root, "templates/default/v1", name);
    const manifest = await readJson(join(directory, "package.json"));
    for (const field of packageFields)
      for (const [dependency, spec] of Object.entries(manifest[field] ?? {}))
        if (
          (dependency === "relkit" || dependency.startsWith("@relkit/")) &&
          spec !== versions.get(dependency)
        )
          throw new Error(`Template ${name} has incompatible ${dependency}@${spec}`);
    if (manifest.dependencies?.["@scalar/hono-api-reference"] !== scalar)
      throw new Error(`Template ${name} Scalar version differs from @relkit/runtime-hono`);
    if (
      manifest.packageManager !== rootManifest.packageManager ||
      // Templates ship the default catalog's TypeScript (5.9); the workspace compiles with its
      // own `catalog:workspace` TypeScript 7 (design D8).
      manifest.devDependencies?.typescript !==
        resolveCatalogVersion(rootManifest, "typescript", "catalog:") ||
      manifest.devDependencies?.["@types/bun"] !==
        resolveCatalogVersion(
          rootManifest,
          "@types/bun",
          rootManifest.devDependencies?.["@types/bun"],
        )
    )
      throw new Error(`Template ${name} tooling versions differ from the workspace`);
    const expectedScripts = expectedTemplateScripts(name);
    if (JSON.stringify(stable(manifest.scripts)) !== JSON.stringify(stable(expectedScripts)))
      throw new Error(`Template ${name} scripts differ from the template contract`);
    const files = [...new Bun.Glob("**/*").scanSync({ cwd: directory, onlyFiles: true })].sort();
    for (const file of files) {
      const text = await readFile(join(directory, file), "utf8");
      if (
        text.includes("workspace:*") ||
        /["']catalog:[^"']*["']/.test(text) ||
        text.includes("<compatible-version>") ||
        (name === "fullstack" ? fullstackForbidden : forbidden).test(text)
      )
        throw new Error(`Template scan failed: ${file}`);
    }
    const tree = digest(
      (
        await Promise.all(
          files.map(async (file) => `${file}\0${await readFile(join(directory, file), "utf8")}\0`),
        )
      ).join(""),
    );
    result.push({ name, files: files.length, sha256: tree });
  }
  return result;
}

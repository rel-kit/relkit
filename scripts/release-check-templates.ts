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
 * @param version - Exact first-party release version.
 * @param rootManifest - Root manifest owning tooling catalogs.
 * @returns Deterministic template file counts and hashes.
 * @throws When scripts, versions, or application import boundaries diverge.
 */
export async function templateInputs(
  version: string,
  rootManifest: RecordValue,
): Promise<RecordValue[]> {
  const result: RecordValue[] = [];
  const forbidden =
    /(?:from|import)\s*["'](?:effect|hono|next|@pulumi\/|@aws-sdk\/|@relkit\/(?:compiler|engine|graph|runtime-effect|runtime-hono|supervisor|providers-local|providers-standard|cloud-aws|deploy|deploy-pulumi|observability|inspector-api))["']/;
  const fullstackForbidden =
    /(?:from|import)\s*["'](?:effect|hono|@pulumi\/|@aws-sdk\/|@relkit\/(?:compiler|engine|graph|runtime-effect|runtime-hono|supervisor|providers-local|providers-standard|cloud-aws|deploy|deploy-pulumi|observability|inspector-api))["']/;
  for (const name of packedTemplates) {
    const directory = join(root, "templates/default/v1", name);
    const manifest = await readJson(join(directory, "package.json"));
    for (const field of packageFields)
      for (const [dependency, spec] of Object.entries(manifest[field] ?? {}))
        if (dependency.startsWith("@relkit/") && spec !== version)
          throw new Error(`Template ${name} has incompatible ${dependency}@${spec}`);
    if (
      manifest.packageManager !== rootManifest.packageManager ||
      manifest.devDependencies?.typescript !==
        resolveCatalogVersion(
          rootManifest,
          "typescript",
          rootManifest.devDependencies?.typescript,
        ) ||
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

import { exportTargets, type PackageInfo, type RecordValue } from "./release-check-support.js";
import { packedTemplates } from "./release-templates.js";

const portableCatalogAssets = [
  "package/src/catalog-resolution.ts",
  "package/src/catalog-resolution.types.ts",
];

/**
 * Validates exports, required assets, and the development-file exclusion contract.
 * @param item - Source package identity and publication allowlist.
 * @param listing - Actual archive member names.
 * @param packed - Actual archive manifest.
 * @returns Nothing when the complete archive contract is satisfied.
 * @throws When required exports or portable assets are missing or forbidden files exist.
 */
export function assertListing(item: PackageInfo, listing: string[], packed: RecordValue): void {
  for (const target of [...exportTargets(packed.exports), ...exportTargets(packed.bin)])
    if (!listing.includes(`package/${target.replace(/^\.\//, "")}`))
      throw new Error(`Packed export target is missing: ${item.name} -> ${target}`);
  for (const required of ["package/LICENSE", "package/README.md", "package/package.json"])
    if (!listing.includes(required))
      throw new Error(`Packed file is missing: ${item.name} -> ${required}`);
  if (item.name === "@relkit/cli" && !listing.includes("package/editor/package.json"))
    throw new Error("Packed CLI editor resolver entry is missing.");
  const forbidden = listing.filter(
    (path) =>
      !(item.name === "create-relkit" && path.startsWith("package/dist/templates/")) &&
      !(item.name === "create-relkit" && portableCatalogAssets.includes(path)) &&
      (/\/(?:src|tests?|__tests__|\.turbo|\.cache)\//.test(path) ||
        /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/.test(path) ||
        /(?:tsconfig\.tsbuildinfo|\.tsbuildinfo)$/.test(path) ||
        (/\.ts$/.test(path) && !/\.d\.ts$/.test(path))),
  );
  if (forbidden.length > 0)
    throw new Error(`Packed development files found in ${item.name}: ${forbidden.join(", ")}`);
  if (item.name === "create-relkit") {
    for (const asset of portableCatalogAssets)
      if (!listing.includes(asset))
        throw new Error(`Packed create-relkit catalog asset is missing: ${asset}`);
    for (const patch of Object.values(packed.relkit?.buildCatalog?.patches ?? {}) as RecordValue[])
      if (!listing.includes(`package/dist/${patch.asset}`))
        throw new Error(`Packed create-relkit patch is missing: ${patch.asset}`);
    for (const template of packedTemplates)
      for (const file of ["package.json", "gitignore"])
        if (!listing.includes(`package/dist/templates/default/v1/${template}/${file}`))
          throw new Error(`Packed create-relkit template is missing: ${template}/${file}`);
  }
}

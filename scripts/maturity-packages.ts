/** Reads the maturity tier of every published package, splitting `relkit` into its source areas. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A published workspace package, or one area of `relkit`, and the tier it declares. */
export interface PackageTier {
  readonly name: string;
  readonly directory: string;
  /** Repository-relative folder holding this item's sources. */
  readonly source: string;
  /** `relkit` area whose export subpaths belong to this item. */
  readonly area?: string;
  readonly tier: unknown;
}

const packageParents = ["packages", "integrations/packages"];

/**
 * Reads every published workspace manifest: `packages/*`, `integrations/packages/*` and
 * `integrations/catalog`. @param root - Repository root. @returns Packages in directory order.
 */
export function readPackageTiers(root: string): PackageTier[] {
  const directories = [
    ...packageParents.flatMap((parent) =>
      existsSync(join(root, parent))
        ? readdirSync(join(root, parent))
            .sort()
            .map((name) => `${parent}/${name}`)
        : [],
    ),
    "integrations/catalog",
  ];
  return directories.flatMap((directory) => {
    const path = join(root, directory, "package.json");
    if (!existsSync(path)) return [];
    const manifest = JSON.parse(readFileSync(path, "utf8")) as {
      name: string;
      private?: boolean;
      relkit?: { maturity?: unknown; labs?: readonly string[] };
    };
    if (manifest.private) return [];
    if (manifest.name === "relkit") return relkitAreaTiers(root, directory, manifest.relkit);
    return [
      {
        name: manifest.name,
        directory,
        source: `${directory}/src`,
        tier: manifest.relkit?.maturity,
      },
    ];
  });
}

/** Splits `relkit` into its source areas; `relkit.labs` lists the areas that are Labs.
 * @param root - Repository root. @param directory - The `relkit` package directory.
 * @param metadata - Its `relkit` manifest field. @returns One item per area. */
function relkitAreaTiers(
  root: string,
  directory: string,
  metadata: { maturity?: unknown; labs?: readonly string[] } | undefined,
): PackageTier[] {
  return readdirSync(join(root, directory, "src"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name: area }) => area)
    .sort()
    .map((area) => ({
      name: area === "app" || area === "launcher" ? "relkit" : `relkit/${area}`,
      directory,
      source: `${directory}/src/${area}`,
      area,
      tier: metadata?.labs?.includes(area) ? "labs" : metadata?.maturity,
    }));
}

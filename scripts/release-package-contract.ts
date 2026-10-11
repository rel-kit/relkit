/**
 * Declares exact export maps for release validation and packed smoke resolution.
 * Pure tables describe intentional leaf boundaries; callers compare these maps
 * against manifests before accepting package bytes. No filesystem work occurs here.
 */
import {
  appSubpaths,
  catalogSubpaths,
  integrationSubpaths,
} from "./release-package-contract-tables.js";
import { packageLeafExports } from "./release-package-leaves.js";
import type { ReleaseExports } from "./release-package-contract.types.js";

const rootExport = { types: "./dist/index.d.ts", import: "./dist/index.js" };

/**
 * Declares packed entry points, preserving intentional import conditions.
 * @param directoryName - Workspace directory basename.
 * @param packageName - Published name for integration-specific subpaths.
 * @returns The export map required by manifest and packed-resolution checks.
 */
export function expectedExports(directoryName: string, packageName?: string): ReleaseExports {
  if (packageName === "@relkit/integrations")
    return Object.fromEntries([
      [".", rootExport],
      ...catalogSubpaths.map((subpath) => [`./${subpath}`, leaf(subpath)]),
    ]);
  const subpaths = packageName ? integrationSubpaths[packageName] : undefined;
  if (subpaths)
    return Object.fromEntries([
      [".", rootExport],
      ...subpaths.map((subpath) => [`./${subpath}`, leaf(`${subpath}/index`)]),
    ]);
  if (directoryName === "app")
    return Object.fromEntries([
      [".", rootExport],
      ...appSubpaths.map((subpath) => {
        if (subpath === "jobs/legacy") return [`./${subpath}`, leaf("jobs-legacy")];
        if (subpath === "internal/runtime") return [`./${subpath}`, leaf("internal-runtime")];
        return [`./${subpath}`, leaf(subpath)];
      }),
    ]);
  return { ".": rootExport, ...packageLeafExports[directoryName] };
}

/**
 * Maps one dist leaf into its declaration and ESM implementation conditions.
 * @param path - Exact package-relative dist module stem.
 * @returns Pure export conditions used by generated table entries.
 */
function leaf(path: string) {
  return { types: `./dist/${path}.d.ts`, import: `./dist/${path}.js` };
}

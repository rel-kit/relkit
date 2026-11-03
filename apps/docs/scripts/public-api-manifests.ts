/** Reads every published workspace export map, failing when a declaration target has no source. */
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { Schema } from "effect";
import { workspacePackageDirectories } from "../../../scripts/workspace-packages.js";
import { PublicApiManifest } from "./public-api.schemas.js";
import type { PublicImport } from "./public-api.types.js";

/** Resolves declaration targets to authored TS/TSX, including explicit source exports.
 * @param directory - Absolute package directory. @param target - Manifest declaration target.
 * @returns Existing source path; throws when documentation cannot inspect an export. */
export function exportSource(directory: string, target: string): string {
  const stem = resolve(
    directory,
    target.replace(/^\.\/dist\//, "./src/").replace(/(?:\.d)?\.(?:ts|mts|cts)$/, ""),
  );
  const source = [".ts", ".tsx", ".mts", ".cts"]
    .map((extension) => `${stem}${extension}`)
    .find(existsSync);
  if (!source) throw new Error(`No documentation source for ${directory}: ${target}`);
  return source;
}

/** `relkit` areas that applications and integrations do not import directly. */
const INTERNAL_RELKIT_AREAS = new Set([
  "contracts",
  "deploy",
  "diagnostics",
  "engine",
  "graph",
  "inspector-api",
  "invocation",
  "local-service",
  "observability",
  "openapi",
  "runtime-effect",
  "runtime-hono",
]);

/** Reference page owner of one export: each `relkit` area is documented on its own page.
 * @param name - Package name. @param subpath - Export map key.
 * @returns `relkit/<area>` for a `relkit` subpath, otherwise the package name. */
function referenceOwner(name: string, subpath: string): string {
  const area = subpath.split("/")[1] ?? "";
  if (name === "relkit")
    return subpath === "." ? name : `relkit/${area === "tasks" ? "jobs" : area}`;
  return MERGED_AREAS[name]?.includes(area) ? `${name}/${area}` : name;
}

/** Source areas merged into tool packages; only the Inspector's local history is documented. */
const MERGED_AREAS: Readonly<Record<string, readonly string[]>> = {
  "@relkit/cli": ["compiler", "client-generator", "supervisor"],
  "@relkit/inspector": ["observability-local"],
  "@relkit/pulumi": ["deploy-pulumi"],
};

/** Inventories supported and explicitly internal import paths independently of the docs catalog.
 * @param root - Repository root. @returns Validated manifests with source locations. */
export function publicManifests(root: string): PublicImport[] {
  return workspacePackageDirectories(root).flatMap((directory) => {
    const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(PublicApiManifest))(
      readFileSync(resolve(directory, "package.json"), "utf8"),
    );
    return Object.entries(manifest.exports).map(([subpath, target]) => ({
      packageName: referenceOwner(manifest.name, subpath),
      description: manifest.description,
      directory: relative(root, directory),
      specifier: manifest.name + (subpath === "." ? "" : subpath.slice(1)),
      source: relative(root, exportSource(directory, target.types)),
      internal:
        /unsupported internal|^internal |^empty compatibility|^deprecated/i.test(
          manifest.description,
        ) ||
        /\/internal(?:\/|$)/.test(subpath) ||
        (manifest.name === "relkit" && INTERNAL_RELKIT_AREAS.has(subpath.split("/")[1] ?? "")) ||
        (manifest.name !== "@relkit/inspector" &&
          MERGED_AREAS[manifest.name]?.includes(subpath.split("/")[1] ?? "") === true),
      symbols: [],
    }));
  });
}

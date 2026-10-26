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

/** Inventories supported and explicitly internal import paths independently of the docs catalog.
 * @param root - Repository root. @returns Validated manifests with source locations. */
export function publicManifests(root: string): PublicImport[] {
  return workspacePackageDirectories(root).flatMap((directory) => {
    const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(PublicApiManifest))(
      readFileSync(resolve(directory, "package.json"), "utf8"),
    );
    return Object.entries(manifest.exports).map(([subpath, target]) => ({
      packageName: manifest.name,
      description: manifest.description,
      directory: relative(root, directory),
      specifier: manifest.name + (subpath === "." ? "" : subpath.slice(1)),
      source: relative(root, exportSource(directory, target.types)),
      internal:
        /unsupported internal|^internal |^empty compatibility/i.test(manifest.description) ||
        /\/internal(?:\/|$)/.test(subpath),
      symbols: [],
    }));
  });
}

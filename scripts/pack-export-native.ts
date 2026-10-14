/** Owns finite native filesystem/SDK operations used by packed export acceptance; unresolved Promise work is joined before root release. */
import { readFile, readdir, mkdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { Effect, Schema } from "effect";
import { canonicalJson } from "@relkit/contracts";
import { observeExecution } from "@relkit/contracts/operation";
import { expectedExports } from "./release-package-contract.js";
import { PackageExportManifest } from "./pack-export.schemas.js";
import { PackageExportFailure } from "./pack-export.errors.js";
import type { PackageExportManifest as Manifest, ExportCommand } from "./pack-export.types.js";

/**
 * Joins one finite foreign operation before an owned fixture root can close.
 * @typeParam A - Exact SDK/native success contract.
 * @param operation - Fixed safe I/O stage.
 * @param run - Finite native or SDK operation without a cancellation interface.
 * @returns Observed native success or tagged failure preserving original provenance.
 */
export function exportNative<A>(operation: string, run: () => Promise<A>) {
  return observeExecution(
    "testing",
    "exports." + operation,
    Effect.tryPromise({
      try: run,
      catch: (cause) =>
        new PackageExportFailure({
          operation,
          cause: new Error("Native export smoke operation failed", { cause }),
        }),
    }).pipe(Effect.uninterruptible),
  );
}

/**
 * Decodes the manifest before granting dependency or export-map authority.
 * @param directory - Read-only package root.
 * @returns Schema-validated fields required by this fixture.
 */
export const readExportManifest = Effect.fn("ExportSmoke.manifest")(function* (directory: string) {
  const text = yield* exportNative("manifest.read", () =>
    readFile(join(directory, "package.json"), "utf8"),
  );
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PackageExportManifest))(text).pipe(
    Effect.mapError(
      (cause) =>
        new PackageExportFailure({
          operation: "manifest.decode",
          cause: new Error("Invalid package manifest", { cause }),
        }),
    ),
  );
});

/**
 * Checks exact names, semantic export maps and executable entries.
 * @param repository - Contributor repository authority.
 * @param directory - Package root.
 * @param manifest - Decoded native package metadata.
 * @returns Completion or an expected pure contract error at the owning adapter.
 */
export function assertExportManifest(
  repository: string,
  directory: string,
  manifest: Manifest,
): void {
  const name = basename(directory);
  let expectedName = `@relkit/${name}`;
  if (relative(repository, directory) === "integrations/catalog")
    expectedName = "@relkit/integrations";
  else if (name === "create-relkit" || name === "relkit") expectedName = name;
  if (manifest.name !== expectedName) throw new Error(`Unexpected package name in ${directory}`);
  if (
    manifest.exports === undefined ||
    canonicalJson(manifest.exports) !== canonicalJson(expectedExports(name, manifest.name))
  )
    throw new Error(`Unsupported export map in ${directory}`);
  let expectedBin: Readonly<Record<string, string>> | undefined;
  if (name === "cli" || name === "relkit") expectedBin = { relkit: "./dist/bin.js" };
  else if (name === "create-relkit") expectedBin = { "create-relkit": "./dist/bin.js" };
  if (expectedBin !== undefined && canonicalJson(manifest.bin ?? {}) !== canonicalJson(expectedBin))
    throw new Error(`Unexpected bin entry in ${directory}`);
}

/**
 * Builds and packs one native package through the captured scoped command owner.
 * @param run - Captured command capability.
 * @param directory - Contributor package build authority.
 * @param artifactRoot - Outer scope-owned artifact destination.
 * @returns One verified tarball path after child exit and output drains.
 */
export const packExportPackage = Effect.fn("ExportSmoke.pack")(function* (
  run: ExportCommand,
  directory: string,
  artifactRoot: string,
) {
  const destination = join(artifactRoot, basename(directory));
  yield* exportNative("artifact.directory", () => mkdir(destination));
  yield* run({ args: ["run", "build"], cwd: directory });
  yield* run({
    args: ["pm", "pack", "--ignore-scripts", "--destination", destination, "--quiet"],
    cwd: directory,
  });
  const paths = (yield* exportNative("artifact.inventory", () => readdir(destination))).filter(
    (path) => path.endsWith(".tgz"),
  );
  const tarball = paths[0];
  if (paths.length !== 1 || tarball === undefined)
    return yield* new PackageExportFailure({
      operation: "artifact.identity",
      cause: new Error("Expected one packed artifact"),
    });
  return join(destination, tarball);
});

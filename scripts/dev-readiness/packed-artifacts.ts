/**
 * Builds candidate packages and repacks their publishable files in the existing
 * isolated release workspace. That workspace resolves current manifest versions
 * instead of the contributor lockfile's cached workspace versions. Release checks
 * verify the actual tarball dependency declarations before fixture installation.
 */
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { packPackages } from "../pack-and-smoke-create-relkit-pack.js";
import { packAll } from "../release-check-artifacts.js";
import { ownedNativePromise } from "@relkit/cli/internal/tooling";
import type { Manifest } from "../pack-and-smoke-create-relkit-support.js";

/**
 * Produces verified tarballs with one current release identity.
 * @param temporary - Measurement-owned directory for tarballs and build output.
 * @param manifests - Current workspace declarations supplied by the packing adapter.
 * @returns Package names mapped to external tarballs after the finite adapter settles.
 */
export const packBaselineArtifacts = Effect.fn("ReadinessBenchmark.packArtifacts")(function* (
  temporary: string,
  manifests: Map<string, { directory: string; manifest: Manifest }>,
) {
  const built = yield* ownedNativePromise("benchmark.buildPackages", () =>
    packPackages(temporary, manifests),
  );
  const items = [...built.keys()].map((name) => {
    const source = manifests.get(name);
    if (source === undefined) throw new Error(`Built package has no declaration: ${name}`);
    return { ...source, name };
  });
  const version = items[0]?.manifest.version;
  if (version === undefined) return yield* Effect.die(new Error("No packages were built"));
  const directory = join(temporary, "release-artifacts");
  const artifacts = yield* ownedNativePromise("benchmark.releasePack", () =>
    packAll(items, version, directory),
  );
  const decode = Schema.decodeUnknownSync(
    Schema.Struct({ name: Schema.String, file: Schema.String }),
  );
  return new Map(
    artifacts.map((artifact) => {
      const value = decode(artifact);
      return [value.name, join(directory, value.file)];
    }),
  );
});

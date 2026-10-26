/**
 * Reuses release packing and manifest verification for the consumer benchmark.
 * Packing reads existing build output; callers must build the candidate first.
 * Supplied artifact directories are identity-checked by the scoped registry.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import {
  readManifests,
  loadReleaseTarballs,
  readPackedManifest,
} from "./pack-and-smoke-create-relkit-pack.js";
import { packAll } from "./release-check-artifacts.js";
import { consumerInputFailure, inspectionNative } from "./consumer-installation-native.js";
import { verifyConsumerArchives } from "./consumer-artifact-verification.js";

const PackedArtifacts = Schema.Array(
  Schema.Struct({
    name: Schema.String,
    version: Schema.String,
    file: Schema.String,
    sha256: Schema.String,
    sha512: Schema.String,
    integrity: Schema.String,
    dependencies: Schema.Record(Schema.String, Schema.String),
  }),
);

/**
 * Loads or creates exact external packs without triggering an uncontrolled build.
 * @param repository - Source workspace whose manifests identify all candidates.
 * @param temporary - Benchmark-owned output root.
 * @param existing - Optional previously built/packed release artifact directory.
 * @returns Manifest and tarball maps; registry acquisition validates actual bytes.
 */
export const consumerArtifacts = Effect.fn("ConsumerArtifacts.prepare")(function* (
  repository: string,
  temporary: string,
  existing?: string,
) {
  const manifests = yield* inspectionNative("artifacts.manifests", () => readManifests(repository));
  if (existing !== undefined) {
    yield* verifyConsumerArchives(existing);
    const tarballs = yield* inspectionNative("artifacts.load", () => loadReleaseTarballs(existing));
    for (const [name, archive] of tarballs) {
      const manifest = yield* inspectionNative("artifacts.manifest", () =>
        readPackedManifest(archive),
      );
      const source = manifests.get(name);
      if (source === undefined || manifest.name !== name)
        return yield* consumerInputFailure(
          "artifacts.identity",
          `Unknown packed candidate identity: ${name}`,
        );
      manifests.set(name, { directory: source.directory, manifest });
    }
    return { manifests, tarballs, directory: existing };
  }
  const directory = join(temporary, "artifacts");
  yield* inspectionNative("artifacts.directory", () => mkdir(directory, { recursive: true }));
  const packed = yield* inspectionNative("artifacts.pack", () =>
    packAll(
      [...manifests].map(([name, item]) => ({ name, ...item })),
      directory,
    ),
  );
  const records = yield* Schema.decodeUnknownEffect(PackedArtifacts)(packed);
  yield* inspectionNative("artifacts.manifest", () =>
    writeFile(
      join(directory, "manifest.json"),
      JSON.stringify({ packages: records }, null, 2) + "\n",
    ),
  );
  return {
    manifests,
    directory,
    tarballs: new Map(records.map((record) => [record.name, join(directory, record.file)])),
  };
});

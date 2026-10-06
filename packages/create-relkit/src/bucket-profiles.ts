import { observeExecution } from "@relkit/contracts/operation";
import { join } from "node:path";
import { Effect } from "effect";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { domainError, domainTry } from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { readFactoryStringProperty } from "./source-edit.js";
import type { BucketDiscovery, BucketSourceReader } from "./bucket-profiles.types.js";

/**
 * Resolves physical bucket ownership using planned source before native project source.
 * @param discovery - Current request's declaration facts.
 * @param read - Optional typed planned-source reader.
 * @returns Profile-to-descriptor ownership; ambiguous source fails before writes.
 */
export const bucketProfileOwnersEffect = Effect.fn("BucketProfiles.owners")(
  function* (discovery: BucketDiscovery, read?: BucketSourceReader) {
    const fallback =
      discovery.profiles.find((item) => item.capability === "bucket" && item.isDefault)?.name ??
      "default";
    const reader = read ?? (yield* GeneratorFileSystem).readText;
    const owners = new Map<string, string>();
    for (const artifact of discovery.artifacts.filter(
      (item) => item.kind === "bucket" && item.exported,
    )) {
      const source = yield* reader(
        read === undefined ? join(discovery.projectRoot, artifact.path) : artifact.path,
      );
      const profile = yield* domainTry(() =>
        readFactoryStringProperty(source, artifact.path, "defineBucket", "profile"),
      );
      if (profile === undefined && artifact.options.includes("profile"))
        return yield* Effect.fail(
          domainError(
            new AddScaffoldError(
              ADD_FAILURE_CODES.unsupportedSourceShape,
              `Cannot resolve bucket profile in ${artifact.path}.`,
            ),
          ),
        );
      owners.set(profile ?? fallback, artifact.id ?? artifact.path);
    }
    return owners;
  },
  (effect) => observeExecution("generator", "planning.bucketProfileOwners", effect),
);

/**
 * Preserves the bucket-ownership Promise API and injected reader contract.
 * @param discovery - Project facts.
 * @param read - Optional existing Promise source reader.
 * @returns Bucket-profile ownership before provider planning.
 */
export function bucketProfileOwners(
  discovery: BucketDiscovery,
  read?: (path: string) => Promise<string>,
): Promise<ReadonlyMap<string, string>> {
  return runGeneratorPromise(
    bucketProfileOwnersEffect(
      discovery,
      read === undefined
        ? undefined
        : (path) => Effect.tryPromise({ try: () => read(path), catch: domainError }),
    ),
  );
}

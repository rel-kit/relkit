/** Supplies the same mutable bytes to snapshot reads, identity checks and query witnesses. */
import { Effect } from "effect";
import { DevSnapshotIoError } from "../../src/dev-snapshot/snapshot-error.js";
import { snapshotDigest } from "../../src/dev-snapshot/snapshot-fingerprint.js";
import type { SnapshotFileOperations } from "../../src/dev-snapshot/snapshot-files.types.js";
import { fixtureObservations } from "./validation-observations.js";

/**
 * Creates explicit file capabilities over one test cohort's native-free state.
 * @param bytes - Shared complete document bytes used by code and assertions.
 * @param paths - Shared project membership used by directory-change assertions.
 * @returns The same production file capability contract with typed fixture read failures.
 */
export function validationFileOperations(
  bytes: Map<string, string>,
  paths: Set<string>,
): SnapshotFileOperations {
  const read = (directory: string, path: string, limit: number) =>
    Effect.suspend(() => {
      const content = bytes.get(`${directory}/${path}`);
      if (content === undefined || Buffer.byteLength(content) > limit)
        return Effect.fail(
          new DevSnapshotIoError({
            operation: "test.read",
            cause: new Error("Fixture member absent or oversized"),
          }),
        );
      return Effect.succeed(Buffer.from(content));
    });
  return {
    observations: (root, queries) => fixtureObservations(bytes, root, queries),
    read,
    identities: (directory, paths, limit) =>
      Effect.forEach(paths, (path) =>
        read(directory, path, limit).pipe(
          Effect.map((content) => ({
            path,
            bytes: content.length,
            hash: snapshotDigest(content),
          })),
        ),
      ),
    mismatch: (directory, members, limit) =>
      Effect.forEach(members, (member) => read(directory, member.path, limit)).pipe(
        Effect.map((contents) => {
          const index = members.findIndex(
            (member, offset) =>
              member.bytes !== contents[offset]?.length ||
              member.hash !== snapshotDigest(contents[offset] ?? new Uint8Array()),
          );
          return index < 0 ? undefined : index;
        }),
      ),
    projectPaths: () => Effect.sync(() => [...paths]),
  };
}

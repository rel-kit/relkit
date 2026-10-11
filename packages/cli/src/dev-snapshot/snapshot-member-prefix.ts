/**
 * Projects sealed capsule member identities through original project authority.
 * Reads and batch hashes share the same prefix, so a nested capsule root never
 * blesses an escaped parent link or accidentally verifies project-level files.
 */
import { Effect } from "effect";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";

/**
 * Adds a previously validated capsule prefix to both native byte operations.
 * @param files - Captured original project file authority.
 * @param root - Original physical project containment root.
 * @param prefix - Owner-validated private stage or content-addressed capsule path.
 * @returns Logical capsule reads whose native containment remains the project root.
 */
export function prefixSnapshotFiles(
  files: SnapshotFileOperations,
  root: string,
  prefix: string,
): SnapshotFileOperations {
  return {
    ...files,
    observations: (_directory, queries) =>
      files
        .observations(
          root,
          queries.map((query) => ({
            ...query,
            path: query.path === "." ? prefix : `${prefix}/${query.path}`,
          })),
        )
        .pipe(
          Effect.map((current) =>
            current.map((query) => ({
              ...query,
              path: query.path === prefix ? "." : query.path.slice(prefix.length + 1),
            })),
          ),
        ),
    read: (_directory, path, limit) => files.read(root, `${prefix}/${path}`, limit),
    identities: (_directory, paths, limit) =>
      files
        .identities(
          root,
          paths.map((path) => `${prefix}/${path}`),
          limit,
        )
        .pipe(
          Effect.map((members) =>
            members.map((member) => ({
              ...member,
              path: member.path.slice(prefix.length + 1),
            })),
          ),
        ),
    mismatch: (_directory, members, limit) =>
      files.mismatch(
        root,
        members.map((member) => ({ ...member, path: `${prefix}/${member.path}` })),
        limit,
      ),
  };
}

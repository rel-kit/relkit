/**
 * Retains exact verified capsule bytes as immutable strings for one dev session.
 * Cohort decoding and installation consume this same capture, so later mutation
 * of cache files cannot replace previously accepted executable content. Native
 * reads retain the original containment authority and each receipt byte bound.
 */
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { snapshotDigest } from "./snapshot-fingerprint.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";
import type { SnapshotMember, SnapshotSealedArtifact } from "./snapshot.types.js";

/**
 * Captures complete members only after comparing actual bytes with the receipt.
 * @param files - Capsule projection of the acquired project file authority.
 * @param root - Logical capsule root; native containment remains project-owned.
 * @param members - Bounded decoded complete artifact inventory.
 * @returns Immutable byte representations or typed integrity/I/O rejection.
 */
export const captureSealedArtifacts = Effect.fn("DevSnapshot.sealArtifacts")(
  (files: SnapshotFileOperations, root: string, members: readonly SnapshotMember[]) =>
    observeExecution(
      "cli",
      "dev.snapshot.seal-artifacts",
      Effect.forEach(
        members,
        (member) =>
          Effect.gen(function* () {
            const bytes = yield* files.read(root, member.path, member.bytes);
            if (bytes.length !== member.bytes || snapshotDigest(bytes) !== member.hash)
              return yield* rejected("artifacts.identity");
            return Object.freeze({ ...member, content: Buffer.from(bytes).toString("base64") });
          }),
        { concurrency: 8 },
      ).pipe(Effect.map((artifacts) => Object.freeze(artifacts))),
      () => ({ members: members.length }),
    ),
);

/**
 * Supplies cohort reads from the exact capture later copied into the candidate.
 * @param files - Captured authority for unrelated operations, never invoked for reads.
 * @param root - Logical capsule identity accepted by this reader.
 * @param artifacts - Immutable accepted strings with complete byte identities.
 * @returns Bounded read authority returning fresh buffers, without exposing mutable storage.
 */
export function sealedArtifactFiles(
  files: SnapshotFileOperations,
  root: string,
  artifacts: readonly SnapshotSealedArtifact[],
): SnapshotFileOperations {
  const members = new Map(artifacts.map((member) => [member.path, member]));
  return {
    ...files,
    read: (directory, path, limit) =>
      Effect.suspend(() => {
        const member = members.get(path);
        if (directory !== root || member === undefined || member.bytes > limit)
          return Effect.fail(rejected("artifacts.read"));
        return Effect.sync(() => Buffer.from(member.content, "base64"));
      }),
  };
}

/**
 * Labels capture divergence without exposing cache bytes or absolute paths.
 * @param operation - Fixed safe verification context.
 * @returns Expected integrity rejection, leaving defects/interruption distinct.
 */
function rejected(operation: string) {
  return new DevSnapshotRejected({ reason: "integrity", operation });
}

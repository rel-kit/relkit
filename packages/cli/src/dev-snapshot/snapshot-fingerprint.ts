/**
 * Computes deterministic content identities shared by preparation and reuse.
 * Input enumeration includes helpers/assets and checks complete bytes through the
 * injected file authority. Sort order is canonical; paths are always relative and
 * environment files are excluded by that authority before hashing.
 */
import { createHash } from "node:crypto";
import { canonicalJson } from "@relkit/contracts";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { SnapshotFiles } from "./snapshot-files.service.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import type { DevSnapshot, SnapshotMember } from "./snapshot.types.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";

/**
 * Hashes complete bytes without incorporating host paths or timestamps.
 * @param bytes - Actual member content or deterministic UTF-8 serialization.
 * @returns A canonical prefixed SHA-256 digest.
 */
export function snapshotDigest(bytes: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * Compares complete ordered member identities without serializing another byte inventory.
 * @param actual - Every path, length and digest returned by the file authority.
 * @param expected - Fully decoded member index in the same declared order.
 * @returns True only when both complete indexes and every byte identity match.
 */
export function sameSnapshotMembers(
  actual: readonly SnapshotMember[],
  expected: readonly SnapshotMember[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((member, index) => {
      const wanted = expected[index];
      return (
        wanted !== undefined &&
        member.path === wanted.path &&
        member.bytes === wanted.bytes &&
        member.hash === wanted.hash
      );
    })
  );
}

/**
 * Captures the complete current project input set through supplied authority.
 * @param root - Project root, including after atomic rename or relocation.
 * @returns Lazy sorted identities with byte lengths/hashes, requiring SnapshotFiles.
 */
export const captureSnapshotInputs = Effect.fn("DevSnapshot.inputs")((root: string) =>
  observeExecution(
    "cli",
    "dev.snapshot.inputs",
    Effect.gen(function* () {
      const files = yield* SnapshotFiles;
      const paths = yield* files.projectPaths(root);
      return yield* Effect.forEach(
        [...paths].sort((left, right) => left.localeCompare(right)),
        (path) =>
          files.read(root, path, 67_108_864).pipe(
            Effect.map((bytes) => ({
              path,
              bytes: bytes.length,
              hash: snapshotDigest(bytes),
            })),
          ),
        { concurrency: 8 },
      );
    }),
  ),
);

/**
 * Includes content identities, dependency resolutions and all compatibility tools.
 * @param receipt - Only the compilation inputs/dependencies/tool identity are read.
 * @returns Canonical input fingerprint independent of filesystem enumeration order.
 */
export function snapshotFingerprint(
  receipt: Pick<DevSnapshot, "inputs" | "dependencies" | "tools" | "typecheckInputs">,
): string {
  return snapshotDigest(
    canonicalJson({
      inputs: [...receipt.inputs].sort((left, right) => left.path.localeCompare(right.path)),
      dependencies: [...receipt.dependencies]
        .sort((left, right) => left.root.localeCompare(right.root))
        .map((dependency) => ({
          ...dependency,
          members: [...dependency.members].sort((left, right) =>
            left.path.localeCompare(right.path),
          ),
        })),
      tools: receipt.tools,
      typecheckInputs: receipt.typecheckInputs,
    }),
  );
}

/**
 * Verifies every declared executable member, including deferred route dependencies.
 * @param files - Acquired filesystem authority, captured by the validation service.
 * @param root - Root of the dependency package or immutable execution capsule.
 * @param members - Complete unique index accepted by the receipt decoder.
 * @returns Lazy complete verification; any changed byte or length rejects reuse.
 */
export const verifySnapshotMembers = Effect.fn("DevSnapshot.members")(function* (
  files: SnapshotFileOperations,
  root: string,
  members: readonly SnapshotMember[],
) {
  const actual = yield* files.identities(
    root,
    members.map((member) => member.path),
    67_108_864,
  );
  if (!sameSnapshotMembers(actual, members))
    return yield* new DevSnapshotRejected({ reason: "integrity", operation: "member.digest" });
});

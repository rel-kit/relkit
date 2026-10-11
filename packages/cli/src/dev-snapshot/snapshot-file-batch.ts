/**
 * Adapts finite native descriptor batches for the owning Effect file service.
 * Partial acquisition rolls back every descriptor; release attempts every close
 * and retains all failures. Each batch remains limited to 128 regular-file reads.
 */
import { createHash } from "node:crypto";
import { closeSync, constants, openSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { Schema } from "effect";
import { SnapshotPath } from "./snapshot.schemas.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { assertSnapshotRoot, readSnapshotDescriptorBytes } from "./snapshot-file-bytes.js";
import type { SnapshotOpenMember, SnapshotReadRoot } from "./snapshot-files.types.js";
import type { SnapshotMember } from "./snapshot.types.js";

/**
 * Opens a bounded batch and rolls back partial acquisition before throwing.
 * @param root - Project containment authority.
 * @param paths - At most 128 portable identities.
 * @returns Native descriptors transferred to the owning Effect acquireRelease.
 */
export function openSnapshotBatch(
  root: string,
  paths: readonly string[],
): readonly SnapshotOpenMember[] {
  if (paths.length > 128)
    throw new DevSnapshotRejected({ reason: "ineligible", operation: "batch.bound" });
  const members: SnapshotOpenMember[] = [];
  try {
    for (const path of paths) {
      if (!Schema.is(SnapshotPath)(path))
        throw new DevSnapshotRejected({ reason: "ineligible", operation: "member.path" });
      members.push({
        path,
        descriptor: openSync(
          join(root, path),
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        ),
      });
    }
    return members;
  } catch (primary) {
    const secondary = releaseDescriptors(members);
    if (secondary.length > 0)
      throw new AggregateError(
        [primary, ...secondary],
        "Snapshot batch acquisition and release failed",
      );
    throw primary;
  }
}

/**
 * Reads and hashes every owned member with identical containment/race checks.
 * @param root - Captured physical project root witness.
 * @param members - Scoped no-follow descriptors.
 * @param limit - Per-member allocation bound.
 * @returns Complete actual identities; expected native throws cross Effect.try once.
 */
export function readSnapshotBatch(
  root: SnapshotReadRoot,
  members: readonly SnapshotOpenMember[],
  limit: number,
): readonly SnapshotMember[] {
  const parents = [...new Set(members.map((member) => dirname(join(root.path, member.path))))];
  assertBatchContainment(root, parents);
  const identities = members.map((member) => {
    const bytes = readSnapshotDescriptorBytes(
      member.descriptor,
      join(root.path, member.path),
      limit,
    );
    return {
      path: member.path,
      bytes: bytes.length,
      hash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    };
  });
  assertBatchContainment(root, parents);
  return identities;
}

/**
 * Checks every unique physical parent before and after one finite descriptor batch.
 * @param root - The original acquired project directory witness.
 * @param parents - Every parent of the exact no-follow descriptors being hashed.
 * @returns Complete containment proof; hashes and descriptor/path inodes still cover each file.
 */
function assertBatchContainment(root: SnapshotReadRoot, parents: readonly string[]): void {
  assertSnapshotRoot(root);
  for (const parent of parents) {
    const path = relative(root.physical, realpathSync(parent));
    if (path === ".." || path.startsWith("../"))
      throw new DevSnapshotRejected({ reason: "ineligible", operation: "batch.containment" });
  }
}

/**
 * Joins every synchronous close and exposes accumulated release evidence.
 * @param members - Descriptors acquired by this batch only.
 * @returns Completion; a failed close never prevents later closes from being attempted.
 */
export function closeSnapshotBatch(members: readonly SnapshotOpenMember[]): void {
  const failures = releaseDescriptors(members);
  if (failures.length > 0) throw new AggregateError(failures, "Snapshot batch release failed");
}

/**
 * Attempts all finite native closes without erasing sibling failures.
 * @param members - Batch-owned descriptors.
 * @returns Complete safe native error evidence, never raw member content.
 */
function releaseDescriptors(members: readonly SnapshotOpenMember[]): Error[] {
  const failures: Error[] = [];
  for (const member of members) {
    try {
      closeSync(member.descriptor);
    } catch (cause) {
      failures.push(new Error("Snapshot descriptor release failed", { cause }));
    }
  }
  return failures;
}

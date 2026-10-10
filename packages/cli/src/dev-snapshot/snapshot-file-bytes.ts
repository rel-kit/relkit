/**
 * Performs one bounded synchronous descriptor read at the native filesystem edge.
 * Descriptor acquisition/release belongs to the surrounding Effect Scope. The
 * buffer cannot grow past the declared limit. The no-follow descriptor is checked
 * before/after reading and must still own the current contained path afterward.
 */
import { fstatSync, readSync, realpathSync, statSync } from "node:fs";
import { relative } from "node:path";
import { DevSnapshotRejected } from "./snapshot-error.js";
import type { SnapshotReadRoot } from "./snapshot-files.types.js";

/**
 * Reads complete bytes without trusting mtime as a cache identity.
 * @param descriptor - No-follow descriptor acquired by the caller's Scope.
 * @param root - Original project containment authority.
 * @param path - Full member path, retaining dependency/capsule parent directories.
 * @param limit - Maximum permitted content bytes.
 * @returns Complete bounded bytes; foreign/domain throws are decoded by Effect.try.
 */
export function readSnapshotFileBytes(
  descriptor: number,
  root: SnapshotReadRoot,
  path: string,
  limit: number,
): Uint8Array {
  assertSnapshotRoot(root);
  assertContained(root.physical, path);
  const bytes = readSnapshotDescriptorBytes(descriptor, path, limit);
  assertContained(root.physical, path);
  assertSnapshotRoot(root);
  return bytes;
}

/**
 * Reads a scoped descriptor after its owning adapter proves parent containment.
 * @param descriptor - No-follow descriptor owned by a single read or finite batch.
 * @param path - Logical member path checked against the descriptor inode.
 * @param limit - Maximum permitted allocation before reading complete bytes.
 * @returns Full bytes with size, inode and concurrent-change checks; the caller owns containment.
 */
export function readSnapshotDescriptorBytes(
  descriptor: number,
  path: string,
  limit: number,
): Uint8Array {
  const before = fstatSync(descriptor);
  if (!before.isFile() || before.size > limit || !Number.isSafeInteger(limit) || limit < 0)
    throw rejected("member.bound");
  const bytes = boundedBytes(descriptor, before.size);
  const after = fstatSync(descriptor);
  const current = statSync(path);
  if (
    bytes.length !== before.size ||
    after.size !== before.size ||
    after.mtimeMs !== before.mtimeMs ||
    after.ctimeMs !== before.ctimeMs ||
    after.dev !== current.dev ||
    after.ino !== current.ino
  )
    throw rejected("member.changed");
  return bytes;
}

/**
 * Resolves root authority once while binding it to a physical directory identity.
 * @param path - Supplied project root, including platform aliases such as /var.
 * @returns Native witness; every subsequent read still checks the directory inode.
 */
export function snapshotReadRoot(path: string): SnapshotReadRoot {
  const physical = realpathSync(path);
  const identity = statSync(path);
  if (!identity.isDirectory()) throw rejected("root.directory");
  return { path, physical, device: identity.dev, inode: identity.ino };
}

/**
 * Rejects replacement of a previously acquired root even when bytes match.
 * @param root - Session-local directory witness, never a global pathname cache.
 * @returns Completion or expected ineligibility before executing any member.
 */
export function assertSnapshotRoot(root: SnapshotReadRoot): void {
  const current = statSync(root.path);
  if (!current.isDirectory() || current.dev !== root.device || current.ino !== root.inode)
    throw rejected("root.changed");
}

/**
 * Allocates at most the accepted size plus one growth-detection byte.
 * @param descriptor - Scoped regular-file descriptor.
 * @param size - Verified size before reading.
 * @returns Actual bytes through EOF, rejecting growth before further allocation.
 */
function boundedBytes(descriptor: number, size: number): Uint8Array {
  const buffer = Buffer.allocUnsafe(size + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const count = readSync(descriptor, buffer, offset, buffer.length - offset, null);
    if (count === 0) return buffer.subarray(0, offset);
    offset += count;
  }
  throw rejected("member.changed");
}

/**
 * Checks the physical member remains below the original project root.
 * @param root - Physical root resolved for this individual operation.
 * @param path - Member whose parents may have been replaced concurrently.
 * @returns Completion or an adapter-domain rejection.
 */
function assertContained(root: string, path: string): void {
  const identity = relative(root, realpathSync(path));
  if (identity === "" || identity === ".." || identity.startsWith("../"))
    throw rejected("member.containment");
}

/**
 * Creates an expected native-boundary rejection with fixed, non-sensitive context.
 * @param operation - Safe identity for the failed filesystem check.
 * @returns Domain failure translated into E by the owning adapter.
 */
function rejected(operation: string): DevSnapshotRejected {
  return new DevSnapshotRejected({ reason: "ineligible", operation });
}

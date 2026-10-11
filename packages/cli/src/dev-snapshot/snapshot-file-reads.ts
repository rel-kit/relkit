/**
 * Owns complete no-follow descriptor reads and bounded batches of byte identities.
 * Each descriptor is closed before another is acquired. Batch instrumentation
 * avoids one metric/log operation per dependency while retaining every byte check.
 */
import { closeSync, constants, openSync } from "node:fs";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { ExecutionSuccessLogs, observeExecution } from "@relkit/contracts/operation";
import { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";
import { SnapshotPath } from "./snapshot.schemas.js";
import { readSnapshotFileBytes, snapshotReadRoot } from "./snapshot-file-bytes.js";
import { openSnapshotBatch, readSnapshotBatch, closeSnapshotBatch } from "./snapshot-file-batch.js";
import { cliOriginalError } from "../cli-errors.js";
import { mapErrorCause } from "../services/map-error-cause.js";
import { ownedNativePromise } from "../services/owned-promise.js";
import { findSnapshotMismatch, hashSnapshotMembers } from "./snapshot-integrity-process.js";
import type { SnapshotFileOperations, SnapshotReadRoot } from "./snapshot-files.types.js";
import type { SnapshotMember } from "./snapshot.types.js";

/**
 * Creates read operations borrowing one acquired file service's root witnesses.
 * @param roots - Session-owned physical roots; never persisted or shared globally.
 * @returns Lazy observed reads and complete batched byte identities.
 */
export function snapshotFileReadOperations(
  roots: Map<string, SnapshotReadRoot>,
): Pick<SnapshotFileOperations, "read" | "identities" | "mismatch"> {
  return {
    read: (root, path, limit) =>
      observeExecution("cli", "dev.snapshot.read", readMember(roots, root, path, limit), () => ({
        members: 1,
      })).pipe(
        Effect.provideService(ExecutionSuccessLogs, false),
        Effect.tap((bytes) => Effect.logDebug("Snapshot member read", { bytes: bytes.length })),
      ),
    identities: (root, paths, limit) =>
      observeExecution(
        "cli",
        "dev.snapshot.identities",
        memberIdentities(roots, root, paths, limit),
        () => ({ members: paths.length }),
      ).pipe(Effect.provideService(ExecutionSuccessLogs, false)),
    mismatch: (root, members, limit) =>
      observeExecution(
        "cli",
        "dev.snapshot.mismatch",
        memberMismatch(roots, root, members, limit),
        () => ({ members: members.length }),
      ).pipe(Effect.provideService(ExecutionSuccessLogs, false)),
  };
}

/** Verifies expected identities with compact worker output for large startup inventories. */
const memberMismatch = Effect.fn("DevSnapshot.Files.mismatch")(function* (
  roots: Map<string, SnapshotReadRoot>,
  root: string,
  members: readonly SnapshotMember[],
  limit: number,
) {
  if (members.length > 20_000)
    return yield* new DevSnapshotRejected({ reason: "ineligible", operation: "members.bound" });
  yield* syncNative("root.acquire", () => acquireSnapshotReadRoot(roots, root));
  if (members.length >= 512)
    return yield* ownedNativePromise("snapshot.integrity", (signal) =>
      findSnapshotMismatch(root, members, limit, signal),
    ).pipe(
      mapErrorCause(
        (cause) =>
          new DevSnapshotIoError({
            operation: "members.verify",
            cause: new Error("Snapshot integrity process failed", {
              cause: cliOriginalError(cause),
            }),
          }),
      ),
    );
  const actual = yield* memberIdentities(
    roots,
    root,
    members.map((member) => member.path),
    limit,
  );
  const index = members.findIndex(
    (member, offset) =>
      member.bytes !== actual[offset]?.bytes || member.hash !== actual[offset]?.hash,
  );
  return index < 0 ? undefined : index;
});

/**
 * Reads one descriptor in a scope whose release preserves the complete failure Cause.
 * @param roots - Current service's contained root witnesses.
 * @param root - Root retained as the containment authority.
 * @param path - Portable relative identity.
 * @param limit - Maximum accepted bytes, checked before allocation.
 * @returns Complete bytes or typed rejection/native failure after descriptor close.
 */
function readMember(
  roots: Map<string, SnapshotReadRoot>,
  root: string,
  path: string,
  limit: number,
) {
  return Effect.scoped(
    Effect.gen(function* () {
      if (!Schema.is(SnapshotPath)(path))
        return yield* new DevSnapshotRejected({
          reason: "ineligible",
          operation: "member.path",
        });
      const authority = yield* syncNative("root.acquire", () =>
        acquireSnapshotReadRoot(roots, root),
      );
      const descriptor = yield* Effect.acquireRelease(
        syncNative("member.open", () =>
          openSync(
            join(root, path),
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          ),
        ),
        (file) => syncNative("member.close", () => closeSync(file)).pipe(Effect.orDie),
      );
      return yield* syncNative("member.read", () =>
        readSnapshotFileBytes(descriptor, authority, join(root, path), limit),
      );
    }),
  );
}

/**
 * Hashes finite batches and yields so cancellation is admitted between batches.
 * @param roots - Captured service root witnesses.
 * @param root - Project containment root, including for nested dependencies.
 * @param paths - Complete unique member index accepted by its owning decoder.
 * @param limit - Per-member byte bound.
 * @returns Every actual byte length and digest; no unchanged timestamp shortcut.
 */
const memberIdentities = Effect.fn("DevSnapshot.Files.identities")(function* (
  roots: Map<string, SnapshotReadRoot>,
  root: string,
  paths: readonly string[],
  limit: number,
) {
  if (paths.length > 20_000)
    return yield* new DevSnapshotRejected({ reason: "ineligible", operation: "members.bound" });
  const identities: SnapshotMember[] = [];
  const authority = yield* syncNative("root.acquire", () => acquireSnapshotReadRoot(roots, root));
  if (paths.length >= 512)
    return yield* ownedNativePromise("snapshot.integrity", (signal) =>
      hashSnapshotMembers(root, paths, limit, signal),
    ).pipe(
      mapErrorCause(
        (cause) =>
          new DevSnapshotIoError({
            operation: "members.verify",
            cause: new Error("Snapshot integrity process failed", {
              cause: cliOriginalError(cause),
            }),
          }),
      ),
    );
  for (let offset = 0; offset < paths.length; offset += 128) {
    yield* Effect.yieldNow;
    const batch = yield* Effect.scoped(
      Effect.gen(function* () {
        const descriptors = yield* Effect.acquireRelease(
          syncNative("batch.open", () =>
            openSnapshotBatch(root, paths.slice(offset, offset + 128)),
          ),
          (members) =>
            syncNative("batch.close", () => closeSnapshotBatch(members)).pipe(Effect.orDie),
        );
        return yield* syncNative("batch.read", () =>
          readSnapshotBatch(authority, descriptors, limit),
        );
      }),
    );
    identities.push(...batch);
  }
  return identities;
});

/**
 * Reuses only the physical root identity captured within this acquired service.
 * @param roots - Private bounded witness map.
 * @param root - Caller-owned project containment authority.
 * @returns Existing or newly captured witness; replacing it later fails reads.
 */
export function acquireSnapshotReadRoot(
  roots: Map<string, SnapshotReadRoot>,
  root: string,
): SnapshotReadRoot {
  const existing = roots.get(root);
  if (existing !== undefined) return existing;
  if (roots.size >= 256)
    throw new DevSnapshotRejected({ reason: "ineligible", operation: "root.bound" });
  const acquired = snapshotReadRoot(root);
  roots.set(root, acquired);
  return acquired;
}

/**
 * Maps expected native boundary failures without swallowing defects in domain code.
 * @typeParam A - Precise successful native result.
 * @param operation - Fixed safe adapter label.
 * @param run - Finite synchronous native operation.
 * @returns Lazy result or typed failure with original native evidence.
 */
function syncNative<A>(operation: string, run: () => A) {
  return Effect.try({
    try: run,
    catch: (cause) =>
      cause instanceof DevSnapshotRejected
        ? cause
        : new DevSnapshotIoError({
            operation,
            cause: new Error("Snapshot file access failed", { cause }),
          }),
  });
}

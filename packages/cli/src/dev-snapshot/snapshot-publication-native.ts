/**
 * Adapts publication filesystem mutations with physical Promise settlement.
 * Owned staging/pointer files have exclusive names; immutable generation rename
 * precedes atomic pointer replacement. Failures leave the prior pointer intact.
 */
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, realpath, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { Context, Effect, Layer, Schema } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { canonicalJson } from "@relkit/contracts";
import { ownedNativePromise } from "../services/owned-promise.js";
import { cliOriginalError } from "../cli-errors.js";
import { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";
import { SnapshotHash, SnapshotPath } from "./snapshot.schemas.js";
import type {
  SnapshotPublicationNativeOperations,
  SnapshotPublicationStage,
} from "./snapshot-publication.types.js";

/** Native mutation authority; constructing the Layer opens no project files. */
export class SnapshotPublicationNative extends Context.Service<
  SnapshotPublicationNative,
  SnapshotPublicationNativeOperations
>()("relkit/DevSnapshot/PublicationNative", {
  make: Effect.sync(
    () =>
      ({
        stage: stageSnapshot,
        write: writeMember,
        install: installGeneration,
        point: pointGeneration,
      }) satisfies SnapshotPublicationNativeOperations,
  ),
}) {}

/** Replaceable native publication implementation with per-operation owned resources. */
export const snapshotPublicationNativeLive = Layer.effect(
  SnapshotPublicationNative,
  SnapshotPublicationNative.make,
);

/**
 * Creates one private stage and registers cleanup before yielding its identity.
 * @param root - Current project root, including after relocation.
 * @returns Owned stage requiring Scope; rollback joins native removal.
 */
const stageSnapshot = Effect.fn("DevSnapshot.publicationStage")(function* (root: string) {
  const projectRoot = yield* native("publication.root", () => realpath(root));
  yield* ensureOwnedDirectories(projectRoot);
  const directory = yield* Effect.acquireRelease(
    native("publication.stage", () => mkdtemp(join(projectRoot, ".relkit/dev/.prepare-"))),
    (directory) =>
      native("publication.rollback", () => rm(directory, { recursive: true, force: true })).pipe(
        Effect.orDie,
      ),
  );
  return { projectRoot, directory };
});

/**
 * Writes complete bytes to an exclusive staged member and flushes its descriptor.
 * @param stage - Owned unpublished directory.
 * @param path - Portable validated artifact or receipt path.
 * @param bytes - Complete caller-provided bytes, bounded by the receipt contract.
 * @returns Joined write or typed I/O/path rejection, never a partially accepted member.
 */
const writeMember = Effect.fn("DevSnapshot.publicationWrite")(function* (
  stage: SnapshotPublicationStage,
  path: string,
  bytes: Uint8Array,
) {
  if (!Schema.is(SnapshotPath)(path) || bytes.length > 67_108_864)
    return yield* rejected("publication.member");
  const segments = path.split("/");
  yield* native("publication.parents", () =>
    mkdir(join(stage.directory, ...segments.slice(0, -1)), { recursive: true }),
  );
  yield* Effect.scoped(
    Effect.gen(function* () {
      const file = yield* Effect.acquireRelease(
        native("publication.open", () =>
          open(
            join(stage.directory, path),
            constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
            0o444,
          ),
        ),
        (file) => native("publication.close", () => file.close()).pipe(Effect.orDie),
      );
      yield* native("publication.write", (signal) => file.writeFile(bytes, { signal }));
      yield* native("publication.sync", () => file.sync());
    }),
  );
});

/**
 * Installs an immutable cohort without overwriting an existing nonempty generation.
 * @param stage - Complete owned stage with a content-addressed receipt.
 * @param generation - Validated SHA-256 receipt identity.
 * @returns Project-relative capsule directory, whether newly installed or already present.
 */
const installGeneration = Effect.fn("DevSnapshot.publicationInstall")(function* (
  stage: SnapshotPublicationStage,
  generation: string,
) {
  if (!Schema.is(SnapshotHash)(generation)) return yield* rejected("publication.generation");
  yield* ensureOwnedDirectories(stage.projectRoot);
  const path = `.relkit/dev/generations/${generation.slice(7)}`;
  yield* native("publication.install", () =>
    rename(stage.directory, join(stage.projectRoot, path)),
  ).pipe(
    Effect.catchCause((cause) => {
      const reason = cause.reasons[0];
      if (cause.reasons.length === 1 && reason?._tag === "Fail") {
        const error = cliOriginalError(reason.error.cause.cause);
        if (
          error instanceof Error &&
          "code" in error &&
          ["ENOTEMPTY", "EEXIST"].includes(String(error.code))
        )
          return Effect.void;
      }
      return Effect.failCause(cause);
    }),
  );
  return path;
});

/**
 * Switches the current receipt atomically after generation verification and guard.
 * @param root - Owning project root; every framework parent must be a real directory.
 * @param generation - Content-addressed immutable receipt identity.
 * @returns Completion after the owned pointer file is flushed and renamed.
 */
const pointGeneration = Effect.fn("DevSnapshot.publicationPointer")(function* (
  root: string,
  generation: string,
) {
  yield* ensureOwnedDirectories(root);
  yield* Effect.scoped(
    Effect.gen(function* () {
      const stage = yield* stageSnapshot(root);
      yield* writeMember(
        stage,
        "current.json",
        Buffer.from(canonicalJson({ version: 1, generation }) + "\n"),
      );
      yield* native("publication.pointer", () =>
        rename(
          join(stage.directory, "current.json"),
          join(stage.projectRoot, ".relkit/dev/current.json"),
        ),
      );
    }),
  );
});

/**
 * Rejects linked/non-directory framework parents before publication mutations.
 * @param root - Canonical project root.
 * @returns Created real directories or typed path/native failure.
 */
const ensureOwnedDirectories = Effect.fn("DevSnapshot.publicationParents")(function* (
  root: string,
) {
  for (const path of [".relkit", ".relkit/dev", ".relkit/dev/generations"]) {
    yield* native("publication.mkdir", () => mkdir(join(root, path), { recursive: true }));
    const stat = yield* native("publication.stat", () => lstat(join(root, path)));
    if (!stat.isDirectory() || stat.isSymbolicLink()) return yield* rejected("publication.parent");
  }
});

/**
 * Normalizes native rejection while joining its physical completion on interruption.
 * @typeParam A - Exact native success contract.
 * @param operation - Fixed safe adapter label.
 * @param run - Finite foreign operation, consuming cancellation when supported.
 * @returns Lazy owned native result or normalized typed I/O failure.
 */
function native<A>(operation: string, run: (signal: AbortSignal) => Promise<A>) {
  return ownedNativePromise(operation, run).pipe(
    mapErrorCause(
      (cause) =>
        new DevSnapshotIoError({
          operation,
          cause: new Error("Snapshot publication failed", { cause }),
        }),
    ),
  );
}

/**
 * Rejects unsafe publication arguments without exposing artifact bytes.
 * @param operation - Fixed bounded validation label.
 * @returns Typed ineligibility distinct from native failures or defects.
 */
function rejected(operation: string) {
  return new DevSnapshotRejected({ reason: "ineligible", operation });
}

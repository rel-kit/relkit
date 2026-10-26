/**
 * Implements bounded no-follow reads and owned directory validation for private
 * discovery. Every descriptor read closes its file handle; callers perform
 * identity checks before cleanup and never trust PID metadata as live authority.
 */
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { Effect, Schema } from "effect";
import {
  connectionAttempt,
  InspectionConnectionError,
  rejectConnection,
} from "./connection-error.js";
import { InspectionDescriptorSchema } from "./protocol.schemas.js";

/**
 * Identifies an application by its canonical root without disclosing that path.
 * @param root - Operator-selected project root.
 * @returns A stable path digest or a typed filesystem failure.
 */
export const inspectionProjectId = Effect.fn("Inspection.projectId")(function* (root: string) {
  const canonical = yield* connectionAttempt("root.realpath", () => realpath(root));
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
});

/**
 * Resolves ignored private discovery beneath a physical project root.
 * @param root - Operator-selected project root.
 * @param access - Publication may create private directories; reads never create.
 * @returns Contained directory or absence; symlinks/foreign ownership fail.
 */
export const inspectionDirectory = Effect.fn("Inspection.directory")(function* (
  root: string,
  access: "read" | "publish",
) {
  const canonical = yield* connectionAttempt("root.realpath", () => realpath(root));
  const state = join(canonical, ".relkit");
  if (!(yield* ownedDirectory(state, access))) return;
  const directory = join(state, "connections");
  if (!(yield* ownedDirectory(directory, access))) return;
  if (access === "publish")
    yield* connectionAttempt("directory.permissions", () => chmod(directory, 0o700));
  return directory;
});

/**
 * Reads one regular owner-private descriptor without following its final link.
 * @param path - Trusted launch path or contained discovered candidate.
 * @returns Validated data and inode evidence; consumes at most 8 KiB plus one byte.
 */
export const readInspectionFile = Effect.fn("Inspection.readDescriptor")((path: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const canonicalParent = yield* connectionAttempt("descriptor.parent", () =>
        realpath(resolve(path, "..")),
      );
      const file = join(canonicalParent, path.split(/[\\/]/).at(-1) ?? "");
      const handle = yield* Effect.acquireRelease(
        connectionAttempt("descriptor.open", () =>
          open(file, constants.O_RDONLY | constants.O_NOFOLLOW),
        ),
        (handle) =>
          connectionAttempt("descriptor.close", () => handle.close()).pipe(
            Effect.catchTag("InspectionConnectionError", () =>
              Effect.logWarning("Inspection descriptor close failed"),
            ),
          ),
      );
      const metadata = yield* connectionAttempt("descriptor.stat", () => handle.stat());
      if (
        !metadata.isFile() ||
        metadata.size > 8192 ||
        !owned(metadata.uid) ||
        (metadata.mode & 0o077) !== 0
      )
        return yield* rejectConnection("descriptor.ownership");
      const buffer = Buffer.alloc(8193);
      const read = yield* connectionAttempt("descriptor.read", () =>
        handle.read(buffer, 0, buffer.length, 0),
      );
      if (read.bytesRead > 8192) return yield* rejectConnection("descriptor.size");
      const descriptor = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(InspectionDescriptorSchema),
        { onExcessProperty: "error" },
      )(buffer.toString("utf8", 0, read.bytesRead)).pipe(
        Effect.mapError(
          (cause) => new InspectionConnectionError({ operation: "descriptor.invalid", cause }),
        ),
      );
      return { path: file, descriptor, metadata };
    }),
  ),
);

/**
 * Inspects an optional path while preserving errors other than absence.
 * @param path - Native path never supplied by a browser.
 * @returns Lstat evidence or undefined; symlinks remain visible to policy.
 */
export function inspectionLstat(path: string) {
  return connectionAttempt("path.stat", () => lstat(path)).pipe(
    Effect.catchIf(isMissingInspectionPath, () => Effect.succeed(undefined)),
  );
}

/**
 * Classifies only native ENOENT as absence.
 * @param error - Typed adapter failure retaining the native cause.
 * @returns Whether reading an optional path may safely report no session.
 */
export function isMissingInspectionPath(error: InspectionConnectionError): boolean {
  return "code" in error.cause && error.cause.code === "ENOENT";
}

/**
 * Checks operating-system ownership where user IDs exist.
 * @param uid - Native file owner.
 * @returns True only for the current owner, or platforms without POSIX ownership.
 */
function owned(uid: number): boolean {
  return process.getuid === undefined || uid === process.getuid();
}

/**
 * Creates or verifies one non-symlink directory without recursive traversal.
 * @param path - Contained directory beneath the canonical root.
 * @param access - Read-only discovery never creates or changes directories.
 * @returns Presence, with foreign/symlink paths rejected before mutation.
 */
const ownedDirectory = Effect.fn("Inspection.ownedDirectory")(function* (
  path: string,
  access: "read" | "publish",
) {
  let metadata = yield* inspectionLstat(path);
  if (metadata === undefined && access === "read") return false;
  if (metadata === undefined) {
    yield* connectionAttempt("directory.create", () => mkdir(path, { mode: 0o700 })).pipe(
      Effect.catchIf(
        (error) => "code" in error.cause && error.cause.code === "EEXIST",
        () => Effect.void,
      ),
    );
    metadata = yield* inspectionLstat(path);
  }
  if (!metadata?.isDirectory() || metadata.isSymbolicLink() || !owned(metadata.uid))
    return yield* rejectConnection("directory.ownership");
  return true;
});

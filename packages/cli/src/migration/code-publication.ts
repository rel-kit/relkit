/**
 * Publishes a code migration's recorded edits and restores them. Publication checks each file
 * still holds its recorded `before` bytes (or is still absent for a created file) right before
 * writing it. Restoration first checks every file, refusing the whole rollback if any file was
 * edited after the migration, then writes originals back and deletes created files. Partial
 * mode (failure or crash recovery) also accepts files the publication had not reached yet.
 */
import { Effect } from "effect";
import { cliPromise } from "../cli-errors.js";
import { fail } from "../main-support.js";
import { LayoutFiles } from "./layout-files.service.js";
import { sameLayoutFile } from "./layout-guards.js";
import { releaseLayoutDirectories } from "./layout-directories.js";
import { updateCodeReceipt } from "./code-receipt.js";
import type { CodeReceiptRecord } from "./code-receipt.schemas.js";

/**
 * Writes every recorded edit after its concurrency guard.
 * @param path - Record path.
 * @param receipt - Prepared record.
 * @returns The committed record.
 */
export const publishCodeEdits = Effect.fn("Migration.code.publish")(function* (
  path: string,
  receipt: CodeReceiptRecord,
) {
  const files = yield* LayoutFiles;
  yield* updateCodeReceipt(path, receipt, "publishing");
  for (const edit of receipt.edits) {
    const current = yield* files.read(receipt.root, edit.path);
    if (!sameLayoutFile(current, edit.before))
      return yield* Effect.fail(
        fail(
          "RELKIT_MIGRATE_CONCURRENT_EDIT",
          `${edit.path} changed after the preview; run relkit migrate again.`,
        ),
      );
    yield* files.put(receipt.root, edit.after);
  }
  return yield* updateCodeReceipt(path, receipt, "committed");
});

/**
 * Restores originals and removes created files, preserving later edits.
 * @param path - Record path.
 * @param receipt - Validated record.
 * @param partial - Accept files still in their original state (failure or crash recovery).
 * @returns The restored record; a later edit refuses the whole restore before any write.
 */
export const restoreCodeEdits = Effect.fn("Migration.code.restore")(function* (
  path: string,
  receipt: CodeReceiptRecord,
  partial: boolean,
) {
  const files = yield* LayoutFiles;
  for (const edit of receipt.edits) {
    const current = yield* files.read(receipt.root, edit.path);
    const migrated = sameLayoutFile(current, edit.after);
    const untouched = partial && sameLayoutFile(current, edit.before);
    if (!migrated && !untouched) {
      yield* updateCodeReceipt(path, receipt, "recovery-required");
      return yield* Effect.fail(
        fail(
          "RELKIT_MIGRATE_RECOVERY_CONFLICT",
          `${edit.path} was edited after the migration, so rollback changed nothing; migration record: ${path}`,
        ),
      );
    }
  }
  for (const edit of receipt.edits) {
    const current = yield* files.read(receipt.root, edit.path);
    if (!sameLayoutFile(current, edit.after)) continue;
    if (edit.before === undefined) yield* files.remove(receipt.root, edit.path);
    else yield* files.put(receipt.root, edit.before);
  }
  yield* cliPromise("migration.directories.release", () =>
    releaseLayoutDirectories(receipt.root, receipt.directories),
  ).pipe(Effect.uninterruptible);
  return yield* updateCodeReceipt(path, receipt, "restored");
});

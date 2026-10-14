/** Coordinates guarded file publication and recovery without claiming cross-file atomicity. */
import { Effect } from "effect";
import { fail } from "../main-support.js";
import { LayoutFiles } from "./layout-files.service.js";
import { sameLayoutFile } from "./layout-guards.js";
import { updateLayoutReceipt } from "./layout-receipt.js";
import type { MigrationReceipt } from "./layout.types.js";
import { recoverableLayoutEdit } from "./layout-publication-policy.js";
import { releaseLayoutDirectories } from "./layout-directories.js";
import { cliPromise } from "../cli-errors.js";

/**
 * Applies the exact edit set after validation, retaining crash-recoverable before/after bytes.
 * @param path - Restricted local receipt.
 * @param receipt - Prepared immutable edit ownership.
 * @returns Committed record after every native mutation settles.
 */
export const publishLayoutEdits = Effect.fn("Migration.publish")(function* (
  path: string,
  receipt: MigrationReceipt,
) {
  const files = yield* LayoutFiles;
  yield* updateLayoutReceipt(path, receipt, "publishing");
  for (const edit of receipt.edits) {
    const current = yield* files.read(receipt.root, edit.before.path);
    if (!sameLayoutFile(current, edit.before))
      return yield* Effect.fail(
        fail("RELKIT_LAYOUT_CONCURRENT_EDIT", `Changed before publication: ${edit.before.path}`),
      );
    if (
      edit.before.path !== edit.after.path &&
      (yield* files.read(receipt.root, edit.after.path)) !== undefined
    )
      return yield* Effect.fail(fail("RELKIT_LAYOUT_DESTINATION_EXISTS", edit.after.path));
    yield* files.put(receipt.root, edit.after);
    if (edit.before.path !== edit.after.path) yield* files.remove(receipt.root, edit.before.path);
  }
  return yield* updateLayoutReceipt(path, receipt, "committed");
});

/**
 * Restores only matching transaction-owned outputs, preserving concurrent user edits.
 * @param path - Restricted local recovery record.
 * @param receipt - Validated exact edit ownership.
 * @param partial - Allows untouched/prepared entries during failure or crash recovery.
 * @returns Restored record; any conflict refuses the entire restoration before mutation.
 */
export const restoreLayoutEdits = Effect.fn("Migration.restore")(function* (
  path: string,
  receipt: MigrationReceipt,
  partial: boolean,
) {
  const files = yield* LayoutFiles;
  for (const edit of receipt.edits) {
    const output = yield* files.read(receipt.root, edit.after.path);
    let original = output;
    if (edit.before.path !== edit.after.path)
      original = yield* files.read(receipt.root, edit.before.path);
    if (!recoverableLayoutEdit(edit, original, output, partial)) {
      yield* updateLayoutReceipt(path, receipt, "recovery-required");
      return yield* Effect.fail(
        fail(
          "RELKIT_LAYOUT_RECOVERY_CONFLICT",
          `Recovery preserved a later edit at ${edit.before.path} or ${edit.after.path}; receipt: ${path}`,
        ),
      );
    }
  }
  for (const edit of receipt.edits) {
    const original = yield* files.read(receipt.root, edit.before.path);
    let output = original;
    if (edit.before.path !== edit.after.path)
      output = yield* files.read(receipt.root, edit.after.path);
    if (!recoverableLayoutEdit(edit, original, output, partial)) {
      yield* updateLayoutReceipt(path, receipt, "recovery-required");
      return yield* Effect.fail(
        fail(
          "RELKIT_LAYOUT_RECOVERY_CONFLICT",
          `Recovery preserved a concurrent edit at ${edit.before.path}; receipt: ${path}`,
        ),
      );
    }
    if (!sameLayoutFile(original, edit.before)) yield* files.put(receipt.root, edit.before);
    if (
      edit.before.path !== edit.after.path &&
      (yield* files.read(receipt.root, edit.after.path)) !== undefined
    )
      yield* files.remove(receipt.root, edit.after.path);
  }
  yield* cliPromise("migration.directories.release", () =>
    releaseLayoutDirectories(receipt.root, receipt.directories),
  ).pipe(Effect.uninterruptible);
  return yield* updateLayoutReceipt(path, receipt, "restored");
});

/**
 * The `relkit migrate` code transaction: preview plans only; write refuses touched files with
 * uncommitted Git changes, records a receipt, publishes, and restores automatically if
 * publication fails or is interrupted; rollback restores a committed (or crashed) receipt.
 * Each returns one secret-free result.
 */
import { resolve } from "node:path";
import { Effect, Exit } from "effect";
import { observeCli } from "../cli-runtime.js";
import { fail } from "../main-support.js";
import { CliProcess } from "../services/process.service.js";
import { planCodeMigration } from "./code-plan.js";
import { createCodeReceipt, readCodeReceipt } from "./code-receipt.js";
import { publishCodeEdits, restoreCodeEdits } from "./code-publication.js";
import { codeMigrationResult, codeRollbackResult } from "./code-result.js";
import type { CodeMigrationOptions } from "./code-migration.types.js";

/**
 * Previews the migration.
 * @param root - Project root.
 * @param options - Migration options.
 * @returns The preview result.
 */
export const previewCodeMigration = Effect.fn("Migration.code.preview")(function* (
  root: string,
  options: CodeMigrationOptions,
) {
  const { plan } = yield* planCodeMigration(resolve(root), options);
  return codeMigrationResult(plan, plan.changes.length === 0 ? "noop" : "preview");
});

/**
 * Applies the migration under a receipt.
 * @param root - Project root.
 * @param options - Migration options.
 * @returns The committed (or no-op) result with the receipt path.
 */
export const writeCodeMigration = Effect.fn("Migration.code.write")(
  function* (root: string, options: CodeMigrationOptions) {
    const { plan, edits } = yield* planCodeMigration(resolve(root), options);
    if (edits.length === 0) return codeMigrationResult(plan, "noop");
    yield* assertTouchedFilesClean(
      plan.root,
      edits.map((edit) => edit.path),
    );
    return yield* Effect.acquireUseRelease(
      createCodeReceipt(plan.root, edits),
      ({ path, receipt }) =>
        publishCodeEdits(path, receipt).pipe(
          Effect.as(codeMigrationResult(plan, "committed", path)),
        ),
      ({ path, receipt }, exit) =>
        Exit.isFailure(exit)
          ? restoreCodeEdits(path, receipt, true).pipe(Effect.asVoid, Effect.orDie)
          : Effect.void,
    );
  },
  (effect) => observeCli("migration.code.write", effect),
);

/**
 * Rolls back a code migration receipt.
 * @param root - Project root.
 * @param path - Receipt path.
 * @returns The rollback result.
 */
export const rollbackCodeMigration = Effect.fn("Migration.code.rollback")(
  function* (root: string, path: string) {
    const record = yield* readCodeReceipt(resolve(root), path);
    yield* restoreCodeEdits(record.path, record.receipt, record.receipt.status !== "committed");
    return codeRollbackResult(record.receipt, record.path);
  },
  (effect) => observeCli("migration.code.rollback", effect),
);

/**
 * Refuses to overwrite uncommitted changes in files the migration edits.
 * @param root - Project root.
 * @param paths - Files the migration writes.
 * @returns Completion outside Git or when every touched tracked file is clean.
 */
const assertTouchedFilesClean = Effect.fn("Migration.code.guard.dirty")(function* (
  root: string,
  paths: readonly string[],
) {
  const process = yield* CliProcess;
  const repo = yield* process.run({
    command: "git",
    args: ["rev-parse", "--show-prefix"],
    cwd: root,
  });
  if (repo.exitCode === 128) return;
  if (repo.exitCode !== 0)
    return yield* Effect.fail(
      fail("RELKIT_MIGRATE_DIRTY", "Unable to inspect uncommitted Git changes."),
    );
  const touched = new Set(paths.map((path) => repo.stdout.trim() + path));
  for (const flags of [[], ["--cached"]]) {
    const dirty = yield* process.run({
      command: "git",
      args: ["diff", ...flags, "--name-only", "-z"],
      cwd: root,
    });
    const conflict = dirty.stdout.split("\0").find((path) => touched.has(path));
    if (dirty.exitCode !== 0 || conflict !== undefined)
      return yield* Effect.fail(
        fail(
          "RELKIT_MIGRATE_DIRTY",
          `Commit or stash your changes to ${conflict ?? "the project"} before relkit migrate --write.`,
        ),
      );
  }
});

/** Pure recovery ownership rules distinguish untouched, partial and committed file states. */
import type { MigrationEdit, MigrationFile } from "./layout.types.js";
import { sameLayoutFile } from "./layout-guards.js";

/**
 * Checks whether receipt-owned restoration can proceed without replacing a later edit.
 * @param edit - Exact before/after ownership.
 * @param original - Current original location.
 * @param output - Current migrated location.
 * @param partial - Whether crash/failure recovery permits untouched or intermediate entries.
 * @returns Whether the current states are exclusively owned by this transaction.
 */
export function recoverableLayoutEdit(
  edit: MigrationEdit,
  original: MigrationFile | undefined,
  output: MigrationFile | undefined,
  partial: boolean,
): boolean {
  const matches = sameLayoutFile(output, edit.after);
  const moved = edit.before.path !== edit.after.path;
  if (
    partial &&
    sameLayoutFile(original, edit.before) &&
    (!moved || output === undefined || matches)
  )
    return true;
  return matches && (!moved || original === undefined);
}

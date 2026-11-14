/**
 * The sentence `relkit db migrate` prints on success. It states a count only when the worker read
 * the migration log before and after the run; otherwise it says the database matches the history
 * without claiming that anything was applied.
 */

/**
 * Describes a successful migration run.
 * @param applied - Migrations this run applied, when known.
 * @param history - Migrations in the history folder.
 * @returns One sentence for the terminal.
 */
export function migrationSummary(applied: number | undefined, history: number): string {
  if (applied === 0) return "Database is up to date: no migrations were pending.";
  if (applied !== undefined)
    return `Applied ${applied} migration${applied === 1 ? "" : "s"}; the database is up to date.`;
  return `Database is up to date with the ${history} migration${history === 1 ? "" : "s"} in history.`;
}

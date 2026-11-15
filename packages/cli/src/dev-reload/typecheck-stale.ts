/**
 * Tells whether the type checker's first pass may have read a file before it was saved. The
 * checker reads the project and only then watches it, so a file saved while that first pass runs
 * is checked as it was and never checked again: the pass reports no error, and the error a
 * developer just saved stays unreported until the file is saved once more.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { UNWATCHED_PROJECT_DIRECTORIES } from "../commands/dev-watch-tree.js";

/** Most entries one scan visits; a tree beyond it is taken as unchanged. */
const SCAN_ENTRY_LIMIT = 20_000;

/**
 * Looks for a file saved after a moment, in the tree the development watcher watches.
 * @param projectRoot - Application root; its `src` directory when there is one, else the root
 *   without dependencies and outputs.
 * @param sinceMs - Epoch milliseconds, the moment the checker was started.
 * @returns Whether any file's modification time is later than that moment.
 */
export function sourceSavedSince(projectRoot: string, sinceMs: number): boolean {
  let remaining = SCAN_ENTRY_LIMIT;
  const scan = (directory: string): boolean => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (remaining <= 0) return false;
      remaining -= 1;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!UNWATCHED_PROJECT_DIRECTORIES.has(entry.name) && scan(path)) return true;
        continue;
      }
      try {
        if (statSync(path).mtimeMs > sinceMs) return true;
      } catch {
        // Removed while scanning: nothing to check again.
      }
    }
    return false;
  };
  const source = join(projectRoot, "src");
  try {
    return scan(statSync(source).isDirectory() ? source : projectRoot);
  } catch {
    return scan(projectRoot);
  }
}

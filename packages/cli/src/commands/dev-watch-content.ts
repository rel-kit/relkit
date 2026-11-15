/**
 * Remembers what each watched file looked like at the last decision, so an event counts as a change
 * only when the file's content differs. The operating system reports files that were read or
 * copied without being changed (an APFS clone of the project folder reports every source file),
 * and a rebuild for each of them is wasted work.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ignoredWatchPath } from "./dev-watch-paths.js";
import { UNWATCHED_PROJECT_DIRECTORIES } from "./dev-watch-tree.js";

/** Largest file compared by content; a larger one (an asset, not source) by size and time. */
const CONTENT_LIMIT_BYTES = 4 * 1024 * 1024;
/**
 * Most entries and bytes one directory recording reads. The baseline is taken while the server
 * starts, so a root that holds far more than source (a monorepo, a data folder) must not delay
 * it: what lies beyond the bounds is unseen, and its first event counts as a change.
 */
const BASELINE_LIMITS: WatchBaselineLimits = { entries: 20_000, bytes: 256 * 1024 * 1024 };

/** Bounds of one directory recording. */
export interface WatchBaselineLimits {
  /** Files and directories visited. */
  readonly entries: number;
  /** Content bytes read. */
  readonly bytes: number;
}

/** What the development watcher knows about the files it has seen. */
export interface WatchContentLedger {
  /**
   * Records the current state of a file, or of every file under a directory.
   * @param path - Absolute path to record; a missing path records nothing.
   * @returns No value.
   */
  readonly record: (path: string) => void;
  /**
   * Keeps the files whose content differs from what was last recorded and records them.
   * Deleted files and files never seen count as changed.
   * @param files - Project-relative portable paths reported by the watcher.
   * @returns The files that changed, in the order given.
   */
  readonly changed: (files: readonly string[]) => readonly string[];
}

/**
 * Creates an empty ledger for one project.
 * @param root - Absolute project root; watcher paths are relative to it.
 * @param limits - Bounds of one directory recording.
 * @returns A ledger that treats every file as unseen until it is recorded.
 */
export function createWatchContentLedger(
  root: string,
  limits: WatchBaselineLimits = BASELINE_LIMITS,
): WatchContentLedger {
  const seen = new Map<string, string>();
  const note = (file: string, absolute: string): string => {
    const signature = signatureOf(absolute);
    seen.set(file, signature);
    return signature;
  };
  const walk = (directory: string, budget: { entries: number; bytes: number }): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (budget.entries <= 0 || budget.bytes <= 0) return;
      const absolute = join(directory, entry.name);
      const file = relative(root, absolute).replaceAll("\\", "/");
      if (ignoredWatchPath(file)) continue;
      budget.entries -= 1;
      if (entry.isDirectory()) {
        if (UNWATCHED_PROJECT_DIRECTORIES.has(entry.name)) continue;
        note(file, absolute);
        walk(absolute, budget);
      } else budget.bytes -= sizeIn(note(file, absolute));
    }
  };
  return {
    record: (path) => {
      try {
        if (statSync(path).isDirectory()) walk(path, { ...limits });
        else note(relative(root, path).replaceAll("\\", "/"), path);
      } catch {
        // A path that cannot be read is recorded when it first appears in an event.
      }
    },
    changed: (files) =>
      files.filter((file) => {
        const before = seen.get(file);
        // Recorded in either case, so a file first seen here is compared from now on.
        const now = note(file, join(root, file));
        return before === undefined || before !== now;
      }),
  };
}

/**
 * Reads the size a content signature starts with.
 * @param signature - A signature from {@link signatureOf}.
 * @returns The bytes read for it; zero for a directory, a missing or a large file.
 */
function sizeIn(signature: string): number {
  const size = Number(signature.slice(0, signature.indexOf(":")));
  return Number.isFinite(size) ? size : 0;
}

/**
 * Summarizes a file for comparison between two events.
 * @param absolute - Absolute path.
 * @returns `missing`, `directory`, or the size with a hash of the content (a modification time
 *   for a file over the content limit).
 */
function signatureOf(absolute: string): string {
  try {
    const stats = statSync(absolute);
    if (stats.isDirectory()) return "directory";
    if (stats.size > CONTENT_LIMIT_BYTES) return `large:${stats.size}:${stats.mtimeMs}`;
    const hash = createHash("sha256").update(readFileSync(absolute)).digest("hex");
    return `${stats.size}:${hash}`;
  } catch {
    return "missing";
  }
}

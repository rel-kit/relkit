/** File globbing on Node through `fs.globSync` and `path.matchesGlob`. */
import { globSync } from "node:fs";
import { posix, relative } from "node:path";

/**
 * Lists regular files under a root that match a pattern.
 * @param root - Directory the pattern is relative to.
 * @param pattern - Glob pattern with forward slashes.
 * @returns Root-relative paths in scan order.
 */
export function nodeGlobFiles(root: string, pattern: string): string[] {
  return globSync(pattern, { cwd: root, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, `${entry.parentPath}/${entry.name}`));
}

/**
 * Matches one path against a pattern.
 * @param path - Forward-slash relative path.
 * @param pattern - Glob pattern.
 * @returns Whether it matches.
 */
export function nodeGlobMatch(path: string, pattern: string): boolean {
  return posix.matchesGlob(path, pattern);
}

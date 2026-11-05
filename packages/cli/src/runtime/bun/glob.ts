/** File globbing on Bun through `Bun.Glob`. */

/**
 * Lists regular files under a root that match a pattern.
 * @param root - Directory the pattern is relative to.
 * @param pattern - Glob pattern with forward slashes.
 * @returns Root-relative paths in scan order.
 */
export function bunGlobFiles(root: string, pattern: string): string[] {
  return [...new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true })];
}

/**
 * Matches one path against a pattern.
 * @param path - Forward-slash relative path.
 * @param pattern - Glob pattern.
 * @returns Whether it matches.
 */
export function bunGlobMatch(path: string, pattern: string): boolean {
  return new Bun.Glob(pattern).match(path);
}

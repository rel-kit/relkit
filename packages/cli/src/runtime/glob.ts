/** File globbing on the runtime the CLI runs on. */
import { bunGlobFiles, bunGlobMatch } from "./bun/glob.js";
import { nodeGlobFiles, nodeGlobMatch } from "./node/glob.js";

const onBun = typeof process.versions.bun === "string";

/**
 * Lists regular files under a root that match a pattern.
 * @param root - Directory the pattern is relative to.
 * @param pattern - Glob pattern with forward slashes.
 * @returns Root-relative paths with forward slashes, in scan order.
 */
export function globFiles(root: string, pattern: string): string[] {
  return (onBun ? bunGlobFiles(root, pattern) : nodeGlobFiles(root, pattern)).map((file) =>
    file.replaceAll("\\", "/"),
  );
}

/**
 * Matches one path against a pattern.
 * @param path - Forward-slash relative path.
 * @param pattern - Glob pattern with forward slashes.
 * @returns Whether it matches.
 */
export function globMatch(path: string, pattern: string): boolean {
  return onBun ? bunGlobMatch(path, pattern) : nodeGlobMatch(path, pattern);
}

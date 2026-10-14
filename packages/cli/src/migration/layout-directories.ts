/** Records and releases only absent destination directories created by a layout publication. */
import { lstat, rmdir } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { migrationNativePath } from "./layout-native-path.js";
import type { MigrationEdit } from "./layout.types.js";

/**
 * Captures absent destination parents before publication acquires directory ownership.
 * @param root - Application root owning the edits.
 * @param edits - Validated before/after snapshots.
 * @returns Missing project-relative directories ordered from deepest to shallowest.
 */
export async function missingLayoutDirectories(
  root: string,
  edits: readonly MigrationEdit[],
): Promise<readonly string[]> {
  const missing = new Set<string>();
  for (const edit of edits) {
    let parent = dirname(await migrationNativePath(root, edit.after.path));
    while (relative(root, parent) !== "") {
      try {
        await lstat(parent);
        break;
      } catch (cause) {
        if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) throw cause;
        missing.add(relative(root, parent).replaceAll("\\", "/"));
      }
      parent = dirname(parent);
    }
  }
  return [...missing].sort(
    (a, b) => b.split("/").length - a.split("/").length || a.localeCompare(b),
  );
}

/**
 * Removes empty owned directories without removing later user content or existing parents.
 * @param root - Application root owning the recovery record.
 * @param directories - Absent-before directories in deepest-first order.
 * @returns Completion; missing and subsequently populated directories are preserved.
 */
export async function releaseLayoutDirectories(
  root: string,
  directories: readonly string[],
): Promise<void> {
  for (const directory of directories) {
    const path = await migrationNativePath(root, directory);
    try {
      const metadata = await lstat(path);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) continue;
      await rmdir(path);
    } catch (cause) {
      if (!(
        cause instanceof Error &&
        "code" in cause &&
        ["ENOENT", "ENOTEMPTY", "EEXIST"].includes(String(cause.code))
      ))
        throw cause;
    }
  }
}

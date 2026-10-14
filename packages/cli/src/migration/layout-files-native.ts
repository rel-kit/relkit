/** Reads authored bytes recursively without following symlinks or entering persistent state. */
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { migrationFile } from "./layout-paths.js";
import type { MigrationFile } from "./layout.types.js";
import { migrationNativePath } from "./layout-native-path.js";

const excluded = new Set([
  "node_modules",
  ".git",
  ".relkit",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".npmrc",
  ".netrc",
  ".ssh",
  ".azure",
  ".gcloud",
  ".docker",
]);

/**
 * Captures one contained file; absence is a real snapshot state, other I/O failures propagate.
 * @param root - Canonical project root.
 * @param path - Relative authored path.
 * @returns Exact snapshot or undefined when absent.
 * @throws Error For symlinks and non-file destinations.
 */
export async function readMigrationFile(
  root: string,
  path: string,
): Promise<MigrationFile | undefined> {
  const location = await migrationNativePath(root, path);
  let metadata;
  try {
    metadata = await lstat(location);
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
    throw cause;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(`Migration requires an ordinary file: ${path}`);
  return migrationFile(path, await readFile(location), metadata.mode);
}

/**
 * Inventories complete authored files, including hidden guidance and untracked service assets.
 * @param root - Project root.
 * @param prefix - Recursive relative directory, empty at the project root.
 * @returns Deterministically ordered byte snapshots; unsupported symlinks fail closed.
 */
export async function inventoryMigrationFiles(
  root: string,
  prefix = "",
): Promise<readonly MigrationFile[]> {
  const files: MigrationFile[] = [];
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (
      excluded.has(entry.name) ||
      entry.name.startsWith(".env") ||
      entry.name === ".aws" ||
      /(?:^credentials(?:\.|$)|\.(?:pem|key|p12|pfx)$)/i.test(entry.name) ||
      entry.name.startsWith(".relkit-")
    )
      continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink())
      throw new Error(`Resolve authored symlink before migration: ${path}`);
    if (entry.isDirectory()) files.push(...(await inventoryMigrationFiles(root, path)));
    else if (entry.isFile()) {
      const file = await readMigrationFile(root, path);
      if (file !== undefined) files.push(file);
    }
  }
  return files;
}

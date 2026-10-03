import { randomUUID } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ensureOwnedDirectory } from "../state.js";

/** Appends and fsyncs the journal record before closing its file handle.
 * @param path - Owned filesystem path.
 * @param value - Value to validate, normalize or project.
 * @returns A Promise completing after append, fsync and handle release.
 */
export async function appendDurably(path: string, value: string): Promise<void> {
  const handle = await open(path, "a", 0o600);
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Fsyncs a temporary file, renames it atomically, and syncs the parent directory.
 * @param path - Owned filesystem path.
 * @param value - Value to validate, normalize or project.
 * @returns A Promise completing after atomic file and directory commit.
 */
export async function writeDurably(path: string, value: string): Promise<void> {
  const directory = ensureOwnedDirectory(dirname(path));
  const temporary = join(directory, `.relkit-tmp-${randomUUID()}`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(value, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    await syncDirectory(directory);
  } catch (cause) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw new Error(
      `Job state file could not be committed: ${cause instanceof Error ? cause.message : "unknown error"}`,
    );
  }
}

/** Fsyncs directory metadata and closes the acquired file handle on every exit.
 * @param directory - Owned filesystem directory.
 * @returns A Promise completing after directory fsync and handle release.
 */
export async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

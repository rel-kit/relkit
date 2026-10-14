/** Protects local receipt storage from symbolic-link directory redirection. */
import { lstat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fail } from "../main-support.js";

/**
 * Checks every existing receipt directory inside the caller-selected application root.
 * @param root - Application root owning the recovery storage.
 * @param directory - Contained receipt directory, which may not yet exist.
 * @returns Completion when all existing directories are ordinary and contained.
 * @throws CliFailureError For redirected or invalid storage.
 */
export async function assertReceiptParents(root: string, directory: string): Promise<void> {
  const base = resolve(root);
  let current = resolve(directory);
  if (!current.startsWith(base + sep))
    throw fail("RELKIT_LAYOUT_RECEIPT_INVALID", "Recovery storage must belong to this project.");
  while (current !== base) {
    try {
      const metadata = await lstat(current);
      if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw fail(
          "RELKIT_LAYOUT_RECEIPT_INVALID",
          "Recovery storage contains a redirected directory.",
        );
    } catch (cause) {
      if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) throw cause;
    }
    current = dirname(current);
  }
}

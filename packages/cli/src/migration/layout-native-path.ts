/** Rejects parent symlinks and escaping paths before native migration byte operations. */
import { lstat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

/**
 * Checks the complete existing parent chain before returning a contained file location.
 * @param root - Caller-selected project or owned stage root.
 * @param path - Project-relative authored path.
 * @returns Contained native location; absent parents are created by the owning mutation.
 * @throws Error For traversal, protected paths or symbolic-link parents.
 */
export async function migrationNativePath(root: string, path: string): Promise<string> {
  const base = resolve(root),
    location = resolve(base, path);
  if (
    !location.startsWith(base + sep) ||
    /(?:^|\/)(?:\.git|\.relkit|node_modules|\.env[^/]*)(?:\/|$)/.test(path)
  )
    throw new Error(`Invalid migration file authority: ${path}`);
  let parent = dirname(location);
  while (parent !== base) {
    try {
      const metadata = await lstat(parent);
      if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw new Error(`Migration parent is not an ordinary directory: ${parent}`);
    } catch (cause) {
      if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) throw cause;
    }
    parent = dirname(parent);
  }
  return location;
}

import { lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

/** Restricts worker file access to existing restart fixtures directly inside the temp directory. */
export function resolveRestartStateRoot(requestedPath: string): string {
  const name = basename(requestedPath);
  if (!/^relkit-restart-(events|jobs)-[A-Za-z0-9]+$/.test(name)) {
    throw new TypeError("Restart state root must be a temporary restart fixture");
  }
  const path = join(tmpdir(), name);
  if (requestedPath !== path || !lstatSync(path).isDirectory()) {
    throw new TypeError("Restart state root must be a real directory inside the temp directory");
  }
  return path;
}

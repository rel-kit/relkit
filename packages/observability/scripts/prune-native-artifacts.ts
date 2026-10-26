/**
 * Removes only obsolete native outputs previously emitted by this package.
 * TypeScript does not remove outputs for moved sources; retaining them would
 * accidentally publish history workers in the lightweight package tarball.
 */
import { rm, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../dist/local");
const entries = await readdir(root).catch((error) => {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
  throw error;
});
const nativeStem =
  /^(?:duckdb-[a-z-]+(?:\.types)?|import-history(?:-effect|\.types)?|worker-client(?:-effect|-service)?|worker)\.(?:js|d\.ts)(?:\.map)?$/;
for (const entry of entries) {
  if (nativeStem.test(entry)) await rm(resolve(root, entry));
}

/** Checks copied immutable worker assets in native production proofs. */
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Checks the copied selected worker generation rather than inferring asset retention from a bundle.
 * @param root - Owned acceptance fixture or relocated application root.
 * @returns The physically copied selected worker asset paths after their presence is verified.
 */
export async function selectedWorkerAssets(root: string): Promise<number> {
  const build = join(root, ".relkit/build");
  const manifest = await readFile(join(build, "jobs.manifest.json"), "utf8");
  assert.ok(manifest.includes("probe.double"));
  const files = [...new Bun.Glob("jobs/**/*").scanSync({ cwd: build, onlyFiles: true })];
  assert.ok(files.length > 0, "Selected immutable worker assets are absent");
  return files.length;
}

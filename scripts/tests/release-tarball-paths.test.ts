/** Rejects archive names escaping the operator-selected release directory before registry use. */
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadReleaseTarballs } from "../pack-and-smoke-create-relkit-pack.js";

test("release archives remain beneath their selected manifest directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-release-path-"));
  try {
    for (const file of ["../outside.tgz", "/tmp/outside.tgz", "nested/../../outside.tgz"]) {
      await writeFile(
        join(root, "manifest.json"),
        JSON.stringify({ packages: [{ name: "relkit", file }] }),
      );
      await expect(loadReleaseTarballs(root)).rejects.toThrow("archive");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** Reads actual gzipped package bytes without a native tar child or unrelated extracted files. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPackedManifest } from "../pack-and-smoke-create-relkit-pack.js";

test("reads the exact packed package manifest from a gzipped archive", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-manifest-reader-"));
  try {
    const manifest = {
      name: "@relkit/fixture",
      version: "9.8.7",
      dependencies: { effect: "4.0.1" },
    };
    const path = join(root, "fixture.tgz");
    await Bun.write(
      path,
      await new Bun.Archive(
        {
          "package/package.json": JSON.stringify(manifest),
          "package/large-unrelated-file.txt": "x".repeat(2_000_000),
        },
        { compress: "gzip" },
      ).bytes(),
    );
    expect(await readPackedManifest(path)).toEqual(manifest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects archives without a packed package manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-manifest-missing-"));
  try {
    const path = join(root, "fixture.tgz");
    await Bun.write(
      path,
      await new Bun.Archive({ "unrelated.json": "{}" }, { compress: "gzip" }).bytes(),
    );
    await expect(readPackedManifest(path)).rejects.toThrow("Packed manifest is absent");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

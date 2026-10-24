/** Requires actual archive closure selection to exclude CLI/compiler and reject missing first-party candidates. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wrapperArchiveClosure } from "../packed-wrapper-archives.js";
import type { Manifest } from "../scaffold-process.types.js";

/** Writes tiny real archives while keeping every candidate's version independent. */
async function fixture(root: string, includeCli: boolean) {
  const definitions: Manifest[] = [
    {
      name: "relkit",
      version: "1.2.3",
      dependencies: { "create-relkit": "2.3.4", ...(includeCli ? { "@relkit/cli": "3.4.5" } : {}) },
    },
    {
      name: "create-relkit",
      version: "2.3.4",
      dependencies: { "@relkit/contracts": "4.5.6", effect: "4.0.1" },
    },
    { name: "@relkit/cli", version: "3.4.5" },
    { name: "@relkit/contracts", version: "4.5.6" },
  ];
  const manifests = new Map<string, { readonly manifest: Manifest }>();
  const archives = new Map<string, string>();
  for (const manifest of definitions) {
    const path = join(root, manifest.name.replaceAll("/", "-") + ".tgz");
    await Bun.write(
      path,
      await new Bun.Archive(
        { "package/package.json": JSON.stringify(manifest) },
        { compress: "gzip" },
      ).bytes(),
    );
    manifests.set(manifest.name, { manifest });
    archives.set(manifest.name, path);
  }
  return { manifests, archives };
}

test("wrapper registry serves only its actual creator runtime archive closure", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-wrapper-closure-"));
  try {
    const { manifests, archives } = await fixture(root, false);
    expect([...(await wrapperArchiveClosure(archives, manifests)).keys()]).toEqual([
      "relkit",
      "create-relkit",
      "@relkit/contracts",
    ]);
    archives.delete("@relkit/contracts");
    await expect(wrapperArchiveClosure(archives, manifests)).rejects.toThrow(
      "Missing wrapper runtime archive: @relkit/contracts",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("wrapper normal CLI dependency remains a rejected packed closure", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-wrapper-cli-"));
  try {
    const { manifests, archives } = await fixture(root, true);
    await expect(wrapperArchiveClosure(archives, manifests)).rejects.toThrow(
      "Wrapper runtime must not require the CLI archive",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

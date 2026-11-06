/** Requires the packed `relkit` closure to come from first-party archives and to exclude the CLI and compiler. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { relkitArchiveClosure, relkitRuntimeClosure } from "../packed-wrapper-archives.js";
import type { Manifest } from "../scaffold-process.types.js";

/** Writes tiny real archives while keeping every candidate's version independent. */
async function fixture(root: string, relkitDependencies: Record<string, string>) {
  const definitions: Manifest[] = [
    { name: "relkit", version: "1.2.3", dependencies: { effect: "4.0.1", ...relkitDependencies } },
    { name: "create-relkit", version: "1.2.3", dependencies: { relkit: "1.2.3" } },
    { name: "@relkit/cli", version: "1.2.3", dependencies: { relkit: "1.2.3" } },
    { name: "@relkit/testing", version: "1.2.3", dependencies: { relkit: "1.2.3" } },
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

/** Runs one test body with an owned temporary directory. */
async function withRoot(body: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "relkit-closure-"));
  try {
    await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("the closure follows packed first-party dependencies and never falls back", async () => {
  await withRoot(async (root) => {
    const { manifests, archives } = await fixture(root, {});
    expect([...(await relkitRuntimeClosure(archives, manifests)).keys()]).toEqual(["relkit"]);
    expect([
      ...(await relkitArchiveClosure(archives, manifests, ["create-relkit", "@relkit/cli"])).keys(),
    ]).toEqual(["create-relkit", "@relkit/cli", "relkit"]);
    archives.delete("relkit");
    await expect(relkitArchiveClosure(archives, manifests, ["create-relkit"])).rejects.toThrow(
      "Missing first-party archive: relkit",
    );
  });
});

test("relkit's runtime closure rejects the CLI and the compiler", async () => {
  await withRoot(async (root) => {
    const cli = await fixture(root, { "@relkit/cli": "1.2.3" });
    await expect(relkitRuntimeClosure(cli.archives, cli.manifests)).rejects.toThrow(
      "relkit's runtime must not require @relkit/cli",
    );
  });
  await withRoot(async (root) => {
    const compiler = await fixture(root, { typescript: "5.9.3" });
    await expect(relkitRuntimeClosure(compiler.archives, compiler.manifests)).rejects.toThrow(
      "relkit must not depend on typescript",
    );
  });
});

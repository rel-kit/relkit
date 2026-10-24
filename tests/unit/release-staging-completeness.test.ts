/** Exercises complete native archive staging, filtered caches and required-input failures. */
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { packAll } from "../../scripts/release-check-artifacts.ts";
import { readPackedManifest } from "../../scripts/pack-and-smoke-create-relkit-pack.ts";

const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function fixture(root: string) {
  const directory = join(root, "contracts");
  await mkdir(directory);
  const manifest = {
    name: "@relkit/contracts",
    version: "0.7.9",
    files: ["dist"],
    exports: { ".": "./dist/index.js" },
  };
  await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
  const files = new Map<string, string | Uint8Array>([
    ["dist/index.js", "export const value = 42;\n"],
    ["dist/.metadata.bin", new Uint8Array([0, 255, 128, 10, 0])],
    ["README.md", "# Native archive fixture\n"],
    ["LICENSE", await readFile("LICENSE")],
  ]);
  for (let index = 0; index < 500; index++)
    files.set(`dist/nested/${index % 7}/module-${index}.js`, `export const value = ${index};\n`);
  for (const [path, bytes] of files) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), bytes);
  }
  await writeFile(join(directory, "dist/tsconfig.tsbuildinfo"), "excluded build cache");
  await writeFile(join(directory, "dist/nested/tsconfig.tsbuildinfo"), "excluded nested cache");
  return { item: { name: manifest.name, directory, manifest }, files };
}

async function archiveMembers(archive: string, output: string): Promise<string[]> {
  const listing = Bun.spawnSync(["tar", "-tzf", archive]);
  expect(listing.exitCode).toBe(0);
  await mkdir(output);
  const extraction = Bun.spawnSync(["tar", "-xzf", archive, "-C", output]);
  expect(extraction.exitCode).toBe(0);
  return listing.stdout
    .toString()
    .trim()
    .split("\n")
    .filter((path) => !path.endsWith("/"))
    .map((path) => path.replace(/^package\//, ""))
    .sort();
}

test("native staging preserves every nested, hidden and binary archive byte", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-stage-content-"));
  try {
    const { item, files } = await fixture(root);
    const output = join(root, "artifacts");
    const artifacts = await packAll([item], output);
    expect(artifacts).toHaveLength(1);
    const archive = join(output, String(artifacts[0]!.file));
    const extracted = join(root, "extracted");
    const members = await archiveMembers(archive, extracted);
    expect(members).toEqual([...files.keys(), "package.json"].sort());
    for (const [path, bytes] of files)
      expect(hash(await readFile(join(extracted, "package", path)))).toBe(hash(bytes));
    const manifest = await readPackedManifest(archive);
    expect(manifest.name).toBe(item.name);
    expect(manifest.version).toBe(item.manifest.version);
    expect(manifest.files).toEqual(["dist"]);
    expect(manifest.exports).toEqual({ ".": "./dist/index.js" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("native staging rejects a missing required source without producing an archive", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-stage-missing-"));
  try {
    const { item } = await fixture(root);
    await rm(join(item.directory, "dist"), { recursive: true });
    const output = join(root, "artifacts");
    await expect(packAll([item], output)).rejects.toThrow("ENOENT");
    expect(await readdir(output)).toEqual([]);
    expect(await readFile(join(item.directory, "README.md"), "utf8")).toBe(
      "# Native archive fixture\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

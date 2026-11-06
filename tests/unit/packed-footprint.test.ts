/** Verifies the production footprint scan finds packages in Bun's isolated store and rejects development tooling. */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertProductionFootprint, installedPackages } from "../../scripts/packed-footprint.ts";

/** Writes one stored package and returns its directory. */
async function stored(root: string, entry: string, name: string): Promise<string> {
  const directory = join(root, "node_modules/.bun", entry, "node_modules", ...name.split("/"));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
  return directory;
}

test("a production footprint lists linked and stored packages and rejects development tooling", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-footprint-"));
  try {
    const relkit = await stored(root, "relkit@0.9.0", "relkit");
    await stored(root, "effect@4.0.1", "effect");
    await mkdir(join(root, "node_modules/@relkit"), { recursive: true });
    await symlink(relkit, join(root, "node_modules/relkit"));
    const redis = await stored(root, "@relkit+redis@0.9.0", "@relkit/redis");
    await symlink(redis, join(root, "node_modules/@relkit/redis"));
    expect(await installedPackages(root)).toEqual(["@relkit/redis", "effect", "relkit"]);
    expect(await assertProductionFootprint(root)).toHaveLength(3);

    await stored(root, "typescript@5.9.3", "typescript");
    await stored(root, "@relkit+cli@0.9.0", "@relkit/cli");
    await expect(assertProductionFootprint(root)).rejects.toThrow(
      "Production install contains development packages: @relkit/cli, typescript",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

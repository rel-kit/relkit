import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import generatorManifest from "../../packages/create-relkit/package.json";

test("scaffold catalog uses each provider's metadata instead of the generator release", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-provider-versions-"));
  const source = join(import.meta.dir, "../../packages/create-relkit/src");
  try {
    await mkdir(join(root, "src"));
    for (const file of ["scaffold-catalog.ts", "build-catalog.ts"])
      await copyFile(join(source, file), join(root, "src", file));
    await symlink(join(source, "add-types.ts"), join(root, "src/add-types.js"));
    const providerVersions = Object.fromEntries(
      Object.keys(generatorManifest.relkit.providerVersions).map((name, index) => [
        name,
        `0.6.${index}`,
      ]),
    );
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        ...generatorManifest,
        version: "0.9.0",
        relkit: { ...generatorManifest.relkit, providerVersions },
      }),
    );
    const { SCAFFOLD_DEPENDENCIES } = await import(join(root, "src/scaffold-catalog.ts"));
    expect(
      Object.keys(SCAFFOLD_DEPENDENCIES)
        .filter((name) => name.startsWith("@relkit/"))
        .sort(),
    ).toEqual(Object.keys(providerVersions).sort());
    for (const [name, version] of Object.entries(providerVersions))
      expect(SCAFFOLD_DEPENDENCIES[name].version, name).toBe(version);
    expect(SCAFFOLD_DEPENDENCIES["drizzle-orm"].version).toBe(
      generatorManifest.relkit.buildCatalog.dependencies["drizzle-orm"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

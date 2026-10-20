import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packAll } from "../../scripts/release-check-artifacts.ts";
import { readPackedManifest } from "../../scripts/pack-and-smoke-create-relkit-pack.ts";

test("real Bun archives preserve different package versions and exact dependency pins", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "relkit-mixed-pack-"));
  try {
    const items = [];
    for (const [name, version, dependencies] of [
      ["@relkit/contracts", "0.7.9", {}],
      ["@relkit/schema", "0.8.1", { "@relkit/contracts": "workspace:*" }],
    ] as const) {
      const directory = join(temporary, name.slice("@relkit/".length));
      await mkdir(join(directory, "dist"), { recursive: true });
      const manifest = {
        name,
        version,
        files: ["dist"],
        exports: { ".": "./dist/index.js" },
        dependencies,
      };
      await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
      await writeFile(join(directory, "dist/index.js"), 'export const value = "packed";\n');
      items.push({ name, directory, manifest });
    }
    const directory = join(temporary, "artifacts");
    const artifacts = await packAll(items, directory);
    expect(artifacts.map((item) => [item.name, item.version])).toEqual([
      ["@relkit/contracts", "0.7.9"],
      ["@relkit/schema", "0.8.1"],
    ]);
    const schema = await readPackedManifest(join(directory, String(artifacts[1]!.file)));
    expect(schema.dependencies?.["@relkit/contracts"]).toBe("0.7.9");
    expect(artifacts[1]!.dependencies).toEqual({ "@relkit/contracts": "0.7.9" });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}, 30_000);

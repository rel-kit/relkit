/** Verifies real isolated Bun packs preserve independent versions and every dependency declaration. */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packAll } from "../../scripts/release-check-artifacts.ts";
import { readPackedManifest } from "../../scripts/pack-and-smoke-create-relkit-pack.ts";
import { packingWorkspaceClosure } from "../../scripts/packing-workspace-closure.ts";

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

test("isolated packing resolves development, optional and peer workspace owners", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "relkit-field-pack-"));
  try {
    const items = await dependencyFieldPackages(temporary);
    const manifests = new Map<string, (typeof items)[number]>(
      items.map((item) => [item.name, item]),
    );
    const selected = packingWorkspaceClosure(["@relkit/schema"], manifests);
    const directory = join(temporary, "artifacts");
    const artifacts = await packAll(
      selected.map((name) => manifests.get(name)!),
      directory,
    );
    expect(artifacts).toHaveLength(4);
    const record = artifacts.find((item) => item.name === "@relkit/schema")!;
    const packed = await readPackedManifest(join(directory, String(record.file)));
    expect(packed.version).toBe("0.8.1");
    expect(packed.devDependencies).toEqual({ "@relkit/contracts": "0.7.3" });
    expect(packed.optionalDependencies).toEqual({ "@relkit/config": "0.7.4" });
    expect(packed.peerDependencies).toEqual({ "@relkit/diagnostics": "0.7.5" });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}, 30_000);

/** Creates tiny real packages without registry dependencies or release-version homogenization. */
async function dependencyFieldPackages(temporary: string) {
  const definitions = [
    [
      "@relkit/schema",
      "0.8.1",
      {
        devDependencies: { "@relkit/contracts": "workspace:*" },
        optionalDependencies: { "@relkit/config": "workspace:*" },
        peerDependencies: { "@relkit/diagnostics": "workspace:*" },
      },
    ],
    ["@relkit/contracts", "0.7.3", {}],
    ["@relkit/config", "0.7.4", {}],
    ["@relkit/diagnostics", "0.7.5", {}],
  ] as const;
  const items = [];
  for (const [name, version, fields] of definitions) {
    const directory = join(temporary, name.slice("@relkit/".length));
    await mkdir(join(directory, "dist"), { recursive: true });
    const manifest = {
      name,
      version,
      files: ["dist"],
      exports: { ".": "./dist/index.js" },
      ...fields,
    };
    await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
    await writeFile(join(directory, "dist/index.js"), 'export const value = "packed";\n');
    items.push({ name, directory, manifest });
  }
  return items;
}

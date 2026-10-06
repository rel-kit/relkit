import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCatalog,
  nativeBuildCatalogSource,
  patchRegistrations,
} from "../../scripts/build-catalog.ts";
import { stageReleaseRoot } from "../../scripts/release-stage.ts";

test("catalog metadata derives exact patch identity, bytes, and native literal types", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-build-catalog-"));
  const manifest = {
    catalog: {
      effect: "4.0.1",
      "@effect/sql-pg": "4.0.1",
      "effect-mq": "0.7.0",
      "drizzle-orm": "1.0.0-rc.5-169397b",
    },
    patchedDependencies: {
      "drizzle-orm@previous": "old.patch",
      "other@1.0.0": "other.patch",
    },
  };
  try {
    await mkdir(join(root, "patches"));
    await writeFile(join(root, "patches/drizzle-orm.patch"), "declarations only\n");
    const catalog = await buildCatalog(root, manifest);
    expect(catalog.patches["drizzle-orm"]).toEqual({
      version: "1.0.0-rc.5-169397b",
      key: "drizzle-orm@1.0.0-rc.5-169397b",
      asset: "patches/drizzle-orm.patch",
      hash: new Bun.CryptoHasher("sha256").update("declarations only\n").digest("hex"),
    });
    expect(patchRegistrations(manifest)).toEqual({
      "other@1.0.0": "other.patch",
      "drizzle-orm@1.0.0-rc.5-169397b": "patches/drizzle-orm.patch",
    });
    expect(nativeBuildCatalogSource(catalog)).toContain(
      'export const effectVersion = "4.0.1" as const;',
    );
    expect(nativeBuildCatalogSource(catalog)).toContain(
      'export const effectMqSdk = "effect-mq@0.7.0" as const;',
    );
    await writeFile(join(root, "patches/drizzle-orm.patch"), "updated declarations\n");
    expect((await buildCatalog(root, manifest)).patches["drizzle-orm"]?.hash).not.toBe(
      catalog.patches["drizzle-orm"]?.hash,
    );
    await expect(
      buildCatalog(root, {
        catalog: { ...manifest.catalog, "@effect/sql-pg": "4.0.0" },
      }),
    ).rejects.toThrow("companion version differs");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release staging provides catalogs, overrides, and patch bytes before installation", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-release-root-"));
  const staging = await mkdtemp(join(tmpdir(), "relkit-release-stage-test-"));
  const manifest = {
    catalog: { effect: "4.0.1" },
    catalogs: { peer: { react: ">=18.0.0" } },
    overrides: { effect: "catalog:" },
    patchedDependencies: { "dependency@1.0.0": "patches/dependency.patch" },
    packageManager: "bun@1.3.10",
  };
  try {
    await mkdir(join(root, "patches"));
    await writeFile(join(root, "patches/dependency.patch"), "patch bytes\n");
    await stageReleaseRoot(root, staging, manifest);
    expect(JSON.parse(await readFile(join(staging, "package.json"), "utf8"))).toEqual({
      ...manifest,
      private: true,
      workspaces: ["packages/*"],
    });
    expect(await readFile(join(staging, "patches/dependency.patch"), "utf8")).toBe("patch bytes\n");
    await expect(
      stageReleaseRoot(root, staging, {
        ...manifest,
        patchedDependencies: { unsafe: "../outside.patch" },
      }),
    ).rejects.toThrow("escapes");
  } finally {
    await Promise.all([root, staging].map((path) => rm(path, { recursive: true, force: true })));
  }
});

import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { packedTemplates } from "../../scripts/release-templates.ts";

const root = resolve(import.meta.dir, "../..");

test("release sync retains the CLI editor assets and remains idempotent", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-release-sync-"));
  try {
    await mkdir(join(fixture, "scripts"), { recursive: true });
    for (const file of [
      "sync-release.ts",
      "workspace-packages.ts",
      "release-templates.ts",
      "catalog-manifest.ts",
      "catalog-manifest.types.ts",
      "build-catalog.ts",
      "build-catalog.types.ts",
    ])
      await copyFile(join(root, "scripts", file), join(fixture, "scripts", file));
    await copyFile(join(root, "package.json"), join(fixture, "package.json"));
    await mkdir(join(fixture, "packages/create-relkit/src"), { recursive: true });
    for (const file of ["catalog-resolution.ts", "catalog-resolution.types.ts"])
      await copyFile(
        join(root, "packages/create-relkit/src", file),
        join(fixture, "packages/create-relkit/src", file),
      );
    await copyFile(
      join(root, "packages/create-relkit/package.json"),
      join(fixture, "packages/create-relkit/package.json"),
    );
    await mkdir(join(fixture, "node_modules"));
    await symlink("../packages/create-relkit", join(fixture, "node_modules/create-relkit"), "dir");
    await mkdir(join(fixture, "patches"));
    await copyFile(
      join(root, "patches/drizzle-orm.patch"),
      join(fixture, "patches/drizzle-orm.patch"),
    );
    for (const name of ["cli", "app"]) {
      const directory = join(fixture, "packages", name);
      await mkdir(directory, { recursive: true });
      await copyFile(join(root, "packages", name, "package.json"), join(directory, "package.json"));
    }
    for (const template of packedTemplates) {
      const directory = join(fixture, "templates/default/v1", template);
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, "package.json"),
        JSON.stringify({
          devDependencies: { typescript: "0.0.0", "@types/bun": "catalog:" },
        }),
      );
    }
    await writeFile(join(fixture, "templates/default/README.md"), "# Templates\n");
    const sync = Bun.spawn([process.execPath, "scripts/sync-release.ts", "--write"], {
      cwd: fixture,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await new Response(sync.stderr).text()).toBe("");
    expect(await sync.exited).toBe(0);
    const cli = JSON.parse(await readFile(join(fixture, "packages/cli/package.json"), "utf8"));
    const app = JSON.parse(await readFile(join(fixture, "packages/app/package.json"), "utf8"));
    expect(cli.files).toEqual(["dist", "editor"]);
    expect(app.files).toEqual(["dist"]);
    const generator = JSON.parse(
      await readFile(join(fixture, "packages/create-relkit/package.json"), "utf8"),
    );
    expect(generator.files).toEqual([
      "dist",
      "src/catalog-resolution.ts",
      "src/catalog-resolution.types.ts",
    ]);
    expect(await Bun.file(join(fixture, "packages/create-relkit/dist/index.js")).exists()).toBe(
      false,
    );
    expect(cli.relkit.buildCatalog.dependencies.typescript).toBe("5.9.3");
    expect(cli.relkit.buildCatalog.patches["drizzle-orm"].key).toBe(
      "drizzle-orm@1.0.0-rc.5-169397b",
    );
    const template = JSON.parse(
      await readFile(join(fixture, "templates/default/v1/minimal/package.json"), "utf8"),
    );
    expect(template.devDependencies).toEqual({
      typescript: "5.9.3",
      "@types/bun": "1.3.10",
    });
    const check = Bun.spawn([process.execPath, "scripts/sync-release.ts"], {
      cwd: fixture,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await new Response(check.stderr).text()).toBe("");
    expect(await check.exited).toBe(0);
    const rootManifest = JSON.parse(await readFile(join(fixture, "package.json"), "utf8"));
    rootManifest.catalog.typescript = "5.9.4";
    await writeFile(join(fixture, "package.json"), JSON.stringify(rootManifest));
    const stale = Bun.spawn([process.execPath, "scripts/sync-release.ts"], {
      cwd: fixture,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await new Response(stale.stderr).text()).toContain("Release metadata is stale");
    expect(await stale.exited).not.toBe(0);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

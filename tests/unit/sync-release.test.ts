/** Verifies authoritative release regeneration, packed asset policy and stale catalog detection. */
import { expect, test } from "bun:test";
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { packedTemplates } from "../../scripts/release-templates.ts";

const root = resolve(import.meta.dir, "../..");

/** Copies real source producers and contracts without any contributor build output. */
async function prepareProducers(fixture: string) {
  await mkdir(join(fixture, "scripts"), { recursive: true });
  for (const file of [
    "sync-release.ts",
    "release-package-descriptions.ts",
    "workspace-packages.ts",
    "release-templates.ts",
    "catalog-manifest.ts",
    "catalog-manifest.types.ts",
    "build-catalog.ts",
    "build-catalog.types.ts",
    "release-plan.ts",
    "integration-dependency-metadata.ts",
  ])
    await copyFile(join(root, "scripts", file), join(fixture, "scripts", file));
  await copyFile(join(root, "package.json"), join(fixture, "package.json"));
  await copyFile(join(root, "tsconfig.base.json"), join(fixture, "tsconfig.base.json"));
  await mkdir(join(fixture, "packages/contracts"), { recursive: true });
  for (const file of ["package.json", "tsconfig.json", "src"])
    await cp(join(root, "packages/contracts", file), join(fixture, "packages/contracts", file), {
      recursive: true,
    });
  await symlink(
    join(root, "packages/contracts/node_modules"),
    join(fixture, "packages/contracts/node_modules"),
    "dir",
  );
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
  for (const name of ["effect", "typescript", "@types"])
    await symlink(join(root, "node_modules", name), join(fixture, "node_modules", name), "dir");
  await mkdir(join(fixture, "node_modules/@relkit"));
  await symlink(
    join(fixture, "packages/contracts"),
    join(fixture, "node_modules/@relkit/contracts"),
    "dir",
  );
  await symlink("../packages/create-relkit", join(fixture, "node_modules/create-relkit"), "dir");
}

/** Produces independent package versions and every supported template manifest. */
async function prepareManifests(fixture: string) {
  await mkdir(join(fixture, "patches"));
  await copyFile(
    join(root, "patches/drizzle-orm.patch"),
    join(fixture, "patches/drizzle-orm.patch"),
  );
  for (const name of ["cli", "app", "relkit"]) {
    const directory = join(fixture, "packages", name);
    await mkdir(directory, { recursive: true });
    await copyFile(join(root, "packages", name, "package.json"), join(directory, "package.json"));
  }
  const appPath = join(fixture, "packages/app/package.json");
  const appSource = JSON.parse(await readFile(appPath, "utf8"));
  appSource.version = "0.8.1";
  await writeFile(appPath, JSON.stringify(appSource));
  for (const template of packedTemplates) {
    const directory = join(fixture, "templates/default/v1", template);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        dependencies: { "@relkit/app": "0.0.0" },
        devDependencies: { typescript: "0.0.0", "@types/bun": "catalog:" },
      }),
    );
  }
  await writeFile(join(fixture, "templates/default/README.md"), "# Templates\n");
}

/** Checks package assets, wrapper ownership, catalog pins and the unchanged Drizzle repair registration. */
async function assertReleaseMetadata(fixture: string) {
  const cli = JSON.parse(await readFile(join(fixture, "packages/cli/package.json"), "utf8"));
  const app = JSON.parse(await readFile(join(fixture, "packages/app/package.json"), "utf8"));
  expect(cli.files).toEqual(["dist", "editor"]);
  expect(app.files).toEqual(["dist"]);
  const wrapper = JSON.parse(await readFile(join(fixture, "packages/relkit/package.json"), "utf8"));
  expect(wrapper.files).toEqual(["dist"]);
  expect(wrapper.dependencies["create-relkit"]).toBe("workspace:*");
  expect(wrapper.dependencies["@relkit/cli"]).toBeUndefined();
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
  expect(cli.relkit.buildCatalog.patches["drizzle-orm"].key).toBe("drizzle-orm@1.0.0-rc.5-169397b");
  const template = JSON.parse(
    await readFile(join(fixture, "templates/default/v1/minimal/package.json"), "utf8"),
  );
  expect(template.devDependencies).toEqual({
    typescript: "5.9.3",
    "@types/bun": "1.3.10",
  });
  expect(template.dependencies["@relkit/app"]).toBe("0.8.1");
}

/** Joins all output and exit from one finite metadata producer invocation. */
async function runSync(fixture: string, write = false) {
  const child = Bun.spawn(
    [process.execPath, ...(write ? ["run", "release:sync"] : ["scripts/sync-release.ts"])],
    {
      cwd: fixture,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

test("release sync bootstraps real contracts from source and remains idempotent", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-release-sync-"));
  let complete = false;
  try {
    await prepareProducers(fixture);
    await prepareManifests(fixture);
    expect(await Bun.file(join(fixture, "packages/contracts/dist/index.js")).exists()).toBe(false);
    const sync = await runSync(fixture, true);
    expect(sync.code, sync.stdout + sync.stderr).toBe(0);
    await assertReleaseMetadata(fixture);
    const check = await runSync(fixture);
    expect(check.stderr).toBe("");
    expect(check.code).toBe(0);
    const rootManifest = JSON.parse(await readFile(join(fixture, "package.json"), "utf8"));
    rootManifest.catalog.typescript = "5.9.4";
    await writeFile(join(fixture, "package.json"), JSON.stringify(rootManifest));
    const stale = await runSync(fixture);
    expect(stale.stderr).toContain("Release metadata is stale");
    expect(stale.code).not.toBe(0);
    complete = true;
  } finally {
    if (complete) await rm(fixture, { recursive: true, force: true });
    else console.error("Failed release synchronization fixture retained: " + fixture);
  }
});

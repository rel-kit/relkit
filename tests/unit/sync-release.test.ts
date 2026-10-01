import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { packedTemplates } from "../../scripts/release-templates.ts";

const root = resolve(import.meta.dir, "../..");

test("release sync retains the CLI editor assets and remains idempotent", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-release-sync-"));
  try {
    await mkdir(join(fixture, "scripts"), { recursive: true });
    for (const file of ["sync-release.ts", "workspace-packages.ts", "release-templates.ts"])
      await copyFile(join(root, "scripts", file), join(fixture, "scripts", file));
    for (const name of ["cli", "app"]) {
      const directory = join(fixture, "packages", name);
      await mkdir(directory, { recursive: true });
      await copyFile(join(root, "packages", name, "package.json"), join(directory, "package.json"));
    }
    for (const template of packedTemplates) {
      const directory = join(fixture, "templates/default/v1", template);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "package.json"), "{}\n");
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
    const check = Bun.spawn([process.execPath, "scripts/sync-release.ts"], {
      cwd: fixture,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await new Response(check.stderr).text()).toBe("");
    expect(await check.exited).toBe(0);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

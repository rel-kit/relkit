import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("real automatic Changesets preserve a manual bump and cover another changed package", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-changeset-coverage-"));
  try {
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: fixture, encoding: "utf8" }).trim();
    git("init", "-b", "main");
    const commit = () =>
      git(
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.test",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "-m",
        "fixture",
      );
    for (const directory of ["scripts", ".changeset", "packages/app/src", "packages/schema/src"])
      await mkdir(join(fixture, directory), { recursive: true });
    for (const file of ["auto-changeset.ts", "workspace-packages.ts"])
      await copyFile(
        resolve(import.meta.dir, "../../scripts", file),
        join(fixture, "scripts", file),
      );
    for (const name of ["app", "schema"]) {
      await writeFile(
        join(fixture, "packages", name, "package.json"),
        JSON.stringify({ name: `@relkit/${name}`, version: "1.0.0" }),
      );
      await writeFile(
        join(fixture, "packages", name, "src/index.ts"),
        "export const before = true;\n",
      );
    }
    git("add", ".");
    commit();
    const base = git("rev-parse", "HEAD");
    const manual = '---\n"@relkit/app": minor\n---\n\nKeep explicit release intent.\n';
    await writeFile(join(fixture, ".changeset/auto-pr-42.md"), manual);
    await writeFile(join(fixture, "packages/schema/src/index.ts"), "export const after = true;\n");
    git("add", ".");
    commit();
    const run = async () => {
      const child = Bun.spawn(
        [
          "node",
          "--experimental-strip-types",
          "scripts/auto-changeset.ts",
          "--base",
          base,
          "--head",
          git("rev-parse", "HEAD"),
          "--pr",
          "42",
          "--summary",
          "Update schema",
          "--write",
        ],
        { cwd: fixture, stdout: "pipe", stderr: "pipe" },
      );
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(code, stdout + stderr).toBe(0);
      return JSON.parse(stdout);
    };
    const first = await run();
    expect(first.packages).toEqual(["@relkit/schema"]);
    expect(await readFile(join(fixture, ".changeset/auto-pr-42.md"), "utf8")).toBe(manual);
    expect(await readFile(first.path, "utf8")).toContain('"@relkit/schema": patch');
    git("add", ".changeset");
    commit();
    const before = await readdir(join(fixture, ".changeset"));
    expect((await run()).created).toBe(false);
    expect(await readdir(join(fixture, ".changeset"))).toEqual(before);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}, 30_000);

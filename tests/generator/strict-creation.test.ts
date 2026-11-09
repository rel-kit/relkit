/** Proves strict creation refuses an untested combination before writing any file. */
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const parents: string[] = [];

afterEach(async () => {
  await Promise.all(parents.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

for (const [label, command] of [
  ["create-relkit", [join(root, "packages/create-relkit/src/bin.ts")]],
  ["relkit create", [join(root, "packages/cli/src/bin.ts"), "create"]],
] as const) {
  test(`${label} --strict leaves the destination empty for an untested combination`, async () => {
    const parent = await mkdtemp(join(tmpdir(), "relkit-strict-create-"));
    parents.push(parent);
    const destination = join(parent, "app");
    await mkdir(destination);
    const child = Bun.spawn(
      [
        process.execPath,
        ...command,
        "app",
        "--directory",
        destination,
        "--template",
        "agent",
        "--force-empty-directory",
        "--no-install",
        "--no-git",
        "--strict",
        "--json",
      ],
      { cwd: parent, env: { ...process.env, CI: "1" }, stdout: "pipe", stderr: "pipe" },
    );
    const [output, error, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, error).toBe(2);
    expect(JSON.parse(output).error).toMatchObject({
      code: "RELKIT_CREATE_UNTESTED",
      message: expect.stringContaining("Tested: template=minimal"),
    });
    expect(await readdir(destination)).toEqual([]);
    expect(await readdir(parent)).toEqual(["app"]);
  }, 60_000);
}

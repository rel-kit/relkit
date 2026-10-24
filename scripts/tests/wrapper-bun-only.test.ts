/** Runs the public executable with only Bun on PATH, preserving its native shebang contract. */
import { expect, test } from "bun:test";
import { chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { root, withFixture, wrapperFixture } from "./creator-isolation.fixture.js";

test("the public wrapper starts with Bun installed and Node absent", async () => {
  await withFixture(async (directory) => {
    await wrapperFixture(directory);
    const executables = join(directory, "bin");
    await mkdir(executables);
    await symlink(process.execPath, join(executables, "bun"));
    const source = await readFile(join(root, "packages/relkit/src/bin.ts"), "utf8");
    const entry = join(directory, "wrapper/relkit");
    await writeFile(entry, source.split("\n")[0] + '\nimport "./index.mjs";\n');
    await chmod(entry, 0o755);
    const result = Bun.spawnSync([entry, "check", "--json"], {
      cwd: directory,
      env: { ...process.env, PATH: executables },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toEqual({
      kind: "project",
      args: ["check", "--json"],
    });
  });
});

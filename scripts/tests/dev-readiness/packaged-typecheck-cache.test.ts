/** Proves typechecking cannot restore an older packaged executable or UI tree. */
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Schema } from "effect";

const repository = resolve(import.meta.dir, "../../..");
const turbo = join(repository, "node_modules/.bin/turbo");
const roots: string[] = [];
const config = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      tasks: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Json)),
    }),
  ),
)(await Bun.file(join(repository, "turbo.json")).text());

for (const name of ["@relkit/cli", "@relkit/inspector"]) {
  test(`${name} typechecking preserves the current packaged runtime`, async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-packaged-typecheck-"));
    roots.push(root);
    const directory = join(root, "packages/tool");
    const dist = join(directory, "dist");
    await mkdir(dist, { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        private: true,
        packageManager: `bun@${Bun.version}`,
        workspaces: ["packages/*"],
      }),
    );
    await writeFile(join(root, ".gitignore"), "node_modules\n.turbo\npackages/*/dist\n");
    await writeFile(
      join(root, "turbo.json"),
      JSON.stringify({
        tasks: { typecheck: { ...config.tasks.typecheck, ...config.tasks[`${name}#typecheck`] } },
      }),
    );
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ name, version: "0.0.0", scripts: { typecheck: "bun -e 'void 0'" } }),
    );
    await run(root, [process.execPath, "install", "--lockfile-only", "--ignore-scripts"]);
    await writeFile(join(dist, "entry.js"), "import './prepared-old.js';\n");
    await writeFile(join(dist, "prepared-old.js"), "console.log('old');\n");
    await run(root, [turbo, "run", "typecheck", "--concurrency=1"]);
    await rm(join(dist, "prepared-old.js"));
    await writeFile(join(dist, "entry.js"), "import './prepared-current.js';\n");
    await writeFile(join(dist, "prepared-current.js"), "console.log('current');\n");
    await run(root, [turbo, "run", "typecheck", "--concurrency=1"]);
    expect(await run(directory, [process.execPath, "dist/entry.js"])).toBe("current\n");
  }, 30_000);
}

async function run(cwd: string, command: string[]): Promise<string> {
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, stdout + stderr).toBe(0);
    return stdout;
  } finally {
    if (child.exitCode === null) child.kill();
    await child.exited;
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

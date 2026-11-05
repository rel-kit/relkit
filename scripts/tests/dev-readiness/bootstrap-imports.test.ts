/**
 * Builds the packaged CLI executable and checks its emitted imports: the executable loads
 * the CLI parser lazily and reaches no other module except, on Node, the TypeScript hooks, so a
 * start never parses the compiler before the selected command needs it.
 */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repository = resolve(import.meta.dir, "../../..");

test("the packaged executable reaches the CLI only through dynamic imports", async () => {
  const child = Bun.spawn([process.execPath, "run", "scripts/package-dev-bootstrap.ts"], {
    cwd: repository,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
  const source = await readFile(join(repository, "packages/cli/dist/bin.js"), "utf8");
  const imports = new Bun.Transpiler({ loader: "js" })
    .scan(source)
    .imports.filter((entry) => entry.path.startsWith("."));
  expect(imports).toEqual([
    { kind: "dynamic-import", path: "./main.js" },
    // Node only: registers the TypeScript hooks before the CLI loads `relkit.config.ts`.
    { kind: "dynamic-import", path: "./runtime/node/typescript-register.js" },
  ]);
}, 30_000);

/** Generated database additions must compile through the actual CLI boundary. */
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { project, add, linkDependencies, registerAddCleanup } from "./add-acceptance-fixture.js";

registerAddCleanup();

test("SQLite database and auth additions pass the native project check", async () => {
  const root = await project("minimal");
  await add(root, ["database", "--dialect", "sqlite", "--no-install"]);
  await add(root, ["auth", "--database-dialect", "sqlite", "--no-install"]);
  await linkDependencies(root);
  const child = Bun.spawn(
    [
      process.execPath,
      resolve(import.meta.dir, "../../packages/cli/src/bin.ts"),
      "check",
      "--project-root",
      root,
      "--json",
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const result = JSON.parse(stdout);
  expect(code, JSON.stringify({ diagnostics: result.diagnostics, stderr })).toBe(0);
  expect(result.ok).toBe(true);
  expect(result.activatable).toBe(true);
  expect(result.diagnostics).toEqual([]);
}, 15_000);

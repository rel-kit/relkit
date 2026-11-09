/**
 * Proves the 0.9 migration guide's example: the 0.8 files in `examples/migrate-0-9/before` go
 * through the built `relkit migrate --write`, and after Prettier every output equals the
 * compiled 0.9 file the guide includes from `examples/migrate-0-9/src`, with nothing left to
 * change by hand. Rollback then restores every 0.8 byte. The 0.9 files type-check with the
 * docs package, so the guide's after snippets compile.
 */
import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { format, resolveConfig } from "prettier";

const example = join(import.meta.dir, "../examples/migrate-0-9");
const cli = join(import.meta.dir, "../../../packages/cli/dist/bin.js");
const roots: string[] = [];

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

/**
 * Lists files below a folder.
 * @param root - Folder to walk.
 * @returns Paths relative to the folder.
 */
async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort();
}

/**
 * Runs the built CLI's migrate command.
 * @param args - Arguments after `migrate`.
 * @returns The parsed JSON result.
 */
async function migrate(...args: string[]) {
  const child = Bun.spawn([process.execPath, cli, "--json", "migrate", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  expect(code, stdout).toBe(0);
  return JSON.parse(stdout) as { status: string; findings: unknown[]; receipt?: string };
}

test("relkit migrate turns the guide's 0.8 example into its compiled 0.9 example", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-migrate-guide-"));
  roots.push(root);
  const before = new Map<string, string>();
  for (const path of await files(join(example, "before"))) {
    const target = path.replace(/\.txt$/, "");
    const text = await readFile(join(example, "before", path), "utf8");
    before.set(target, text);
    await mkdir(dirname(join(root, target)), { recursive: true });
    await writeFile(join(root, target), text);
  }
  const written = await migrate("--project-root", root, "--write");
  expect(written.status).toBe("committed");
  expect(written.findings).toEqual([]);
  const expected = (await files(join(example, "src"))).map((path) => `src/${path}`);
  expect(expected).toContain("src/services/auth/better-auth.ts");
  for (const path of expected) {
    const output = await readFile(join(root, path), "utf8");
    const options = await resolveConfig(join(example, path));
    const formatted = await format(output, { ...options, filepath: join(example, path) });
    expect(formatted, path).toBe(await readFile(join(example, path), "utf8"));
  }
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  expect(manifest.dependencies["@relkit/app"]).toBeUndefined();
  expect(manifest.dependencies.relkit).toMatch(/^\d+\.\d+\.\d+/);
  expect((await migrate("--project-root", root, "--rollback", written.receipt!)).status).toBe(
    "rolled-back",
  );
  for (const [path, text] of before) expect(await readFile(join(root, path), "utf8")).toBe(text);
});

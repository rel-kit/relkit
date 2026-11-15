/**
 * `relkit add database` follows the project's package manager: an npm project gets no
 * `patchedDependencies` and an approved esbuild install script and is told that the Drizzle
 * declaration repair was skipped; a pnpm project gets the repair in `pnpm-workspace.yaml`, the only
 * file pnpm reads patches from; a Bun project keeps the `package.json` entry.
 */
import { expect } from "bun:test";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatAddResult } from "../../packages/cli/src/scaffolding/index.ts";
import {
  readDrizzlePatch,
  SKIPPED_PATCH,
} from "../../packages/create-relkit/src/dependency-patches.ts";
import { add, addTest as test, project, registerAddCleanup } from "./add-acceptance-fixture.js";

registerAddCleanup();

/**
 * Creates the minimal project for one manager and adds a database to it, without installing.
 * @param packageManager - `packageManager` field value of the project.
 * @param extra - Manifest fields the project already has.
 * @returns Project root, manifest after the add, and the add result.
 */
async function addDatabase(packageManager: string, extra: Record<string, unknown> = {}) {
  const root = await project("minimal");
  const path = join(root, "package.json");
  const authored = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, `${JSON.stringify({ ...authored, packageManager, ...extra }, null, 2)}\n`);
  const result = await add(root, ["database", "--no-install"]);
  return { root, manifest: JSON.parse(await readFile(path, "utf8")), result };
}

/**
 * Reads a project file when it exists.
 * @param path - Absolute path.
 * @returns Its text, or undefined.
 */
function optional(path: string) {
  return lstat(path).then(
    () => readFile(path, "utf8"),
    () => undefined,
  );
}

test("relkit add database in an npm project skips the repair, says so and approves esbuild", async () => {
  const patch = await readDrizzlePatch();
  const { root, manifest, result } = await addDatabase("npm@11.19.1");
  expect(manifest.patchedDependencies).toBeUndefined();
  expect(manifest.allowScripts).toEqual({ esbuild: true });
  expect(manifest.devDependencies["drizzle-kit"]).toEqual(expect.any(String));
  expect(await optional(join(root, patch.path))).toBeUndefined();
  expect(await optional(join(root, "pnpm-workspace.yaml"))).toBeUndefined();
  expect(result.warnings).toContainEqual({
    code: "dependency-patch-skipped",
    message: SKIPPED_PATCH,
  });
  expect(formatAddResult(result)).toContain(SKIPPED_PATCH);
}, 60_000);

test("relkit add database in an npm project merges esbuild into an existing allowScripts", async () => {
  const { manifest } = await addDatabase("npm@11.19.1", { allowScripts: { sharp: true } });
  expect(manifest.allowScripts).toEqual({ sharp: true, esbuild: true });
}, 60_000);

test("relkit add database in a pnpm project registers the repair in pnpm-workspace.yaml", async () => {
  const patch = await readDrizzlePatch();
  const { root, manifest, result } = await addDatabase("pnpm@11.1.0");
  expect(manifest.patchedDependencies).toBeUndefined();
  expect(manifest.allowScripts).toBeUndefined();
  expect(await optional(join(root, patch.path))).toBe(patch.content);
  expect(await optional(join(root, "pnpm-workspace.yaml"))).toBe(
    `patchedDependencies:\n  ${patch.key}: ${patch.path}\n`,
  );
  expect(result.warnings.map((warning) => warning.code)).not.toContain("dependency-patch-skipped");
}, 60_000);

test("relkit add database in a Bun project keeps the repair in package.json", async () => {
  const patch = await readDrizzlePatch();
  const { root, manifest, result } = await addDatabase("bun@1.3.10");
  expect(manifest.patchedDependencies).toEqual({ [patch.key]: patch.path });
  expect(manifest.allowScripts).toBeUndefined();
  expect(await optional(join(root, "pnpm-workspace.yaml"))).toBeUndefined();
  expect(result.warnings.map((warning) => warning.code)).not.toContain("dependency-patch-skipped");
}, 60_000);

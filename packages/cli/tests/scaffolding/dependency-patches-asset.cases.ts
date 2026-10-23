/** Exercises asset behavior for portable Drizzle repair, using owned temporary projects and awaited installer cleanup. */
import { expect } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ADD_FAILURE_CODES } from "create-relkit/internal/add-types";

import {
  planDependencyPatch,
  prepareProjectDependencyPatch,
  readDrizzlePatch,
} from "create-relkit/internal/dependency-patches";
import { patchBuilder, withProject } from "./dependency-patches.fixture.js";

/** Verifies that uses the central version and byte-identical canonical patch asset.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseUsesTheCentralVersionAndByteIdentical() {
  const patch = await readDrizzlePatch();
  const canonical = await readFile(
    resolve(import.meta.dir, "../../../../patches/drizzle-orm.patch"),
  );
  expect(Buffer.from(patch.content)).toEqual(canonical);
  expect(patch.hash).toBe(createHash("sha256").update(canonical).digest("hex"));
  expect(patch.key).toBe(`drizzle-orm@${patch.version}`);
  expect(patch.path).toBe(`patches/${patch.key}.patch`);
}

/** Verifies that reuses identical assets and preserves unrelated patch entries and file modes.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseReusesIdenticalAssetsAndPreservesUnrelatedPatch() {
  await withProject(
    async (root) => {
      const patch = await readDrizzlePatch();
      await prepareProjectDependencyPatch(root);
      await chmod(join(root, patch.path), 0o640);
      const source = await readFile(join(root, "package.json"), "utf8");
      expect(JSON.parse(source).patchedDependencies).toEqual({
        "another-package@1.0.0": "patches/another.patch",
        [patch.key]: patch.path,
      });
      expect(await planDependencyPatch(root, source, patch)).toEqual({ content: source });
      expect((await stat(join(root, patch.path))).mode & 0o777).toBe(0o640);
    },
    { patchedDependencies: { "another-package@1.0.0": "patches/another.patch" } },
  );
}

/** Verifies that rejects a conflicting entry or asset before changing the manifest.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseRejectsAConflictingEntryOrAssetBefore() {
  const patch = await readDrizzlePatch();
  for (const conflict of ["entry", "asset"] as const) {
    await withProject(async (root) => {
      if (conflict === "entry") {
        const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
        manifest.patchedDependencies = { [patch.key]: "patches/user-owned.patch" };
        await writeFile(join(root, "package.json"), JSON.stringify(manifest));
      } else {
        await mkdir(join(root, "patches"));
        await writeFile(join(root, patch.path), "user-owned repair\n");
      }
      const before = await readFile(join(root, "package.json"));
      await expect(patchBuilder(root).finish()).rejects.toMatchObject({
        code: ADD_FAILURE_CODES.collision,
      });
      expect(await readFile(join(root, "package.json"))).toEqual(before);
      if (conflict === "asset") {
        expect(await readFile(join(root, patch.path), "utf8")).toBe("user-owned repair\n");
      } else {
        expect(await Bun.file(join(root, patch.path)).exists()).toBe(false);
      }
    });
  }
}

/** Verifies that rejects symlinked patch directories instead of reusing external assets.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseRejectsSymlinkedPatchDirectoriesInsteadOfReusing() {
  await withProject(async (root) => {
    const patch = await readDrizzlePatch();
    const outside = join(root, "outside");
    await mkdir(outside);
    await writeFile(join(outside, `${patch.key}.patch`), patch.content);
    await symlink(outside, join(root, "patches"));
    await expect(patchBuilder(root).finish()).rejects.toMatchObject({
      code: ADD_FAILURE_CODES.collision,
    });
  });
}

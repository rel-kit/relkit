/**
 * A created project carries only the patch and install-script fields its package manager honours:
 * Bun reads `patchedDependencies` from `package.json`, pnpm from `pnpm-workspace.yaml`, npm applies
 * no patches and approves install scripts through `allowScripts`.
 */
import { afterEach, expect, test } from "bun:test";
import { cp, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { planDependencyPatch, readDrizzlePatch, SKIPPED_PATCH } from "../src/dependency-patches.js";
import { generateProject } from "../src/generate.js";
import { normalizeCreateOptions } from "../src/options.js";

const templateRoot = resolve(import.meta.dir, "../../../templates/default/v1");
const parents: string[] = [];
afterEach(async () => {
  for (const parent of parents.splice(0)) await rm(parent, { recursive: true, force: true });
});

/**
 * Creates a project for one manager from the minimal template, optionally selecting Drizzle.
 * @param manager - `--package-manager` value.
 * @param drizzle - Whether the template declares drizzle-orm, so the repair applies.
 * @returns Destination, parsed manifest and progress messages.
 */
async function create(manager: "bun" | "npm" | "pnpm", drizzle: boolean) {
  const parent = await mkdtemp(join(tmpdir(), "relkit-manager-manifest-"));
  parents.push(parent);
  const templates = join(parent, "templates");
  await cp(join(templateRoot, "minimal"), join(templates, "minimal"), { recursive: true });
  if (drizzle) {
    const path = join(templates, "minimal/package.json");
    const manifest = JSON.parse(await readFile(path, "utf8"));
    manifest.dependencies["drizzle-orm"] = (await readDrizzlePatch()).version;
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const progress: string[] = [];
  const result = await generateProject(
    normalizeCreateOptions(["app", "--package-manager", manager, "--no-install", "--no-git"]),
    {
      cwd: parent,
      templateRoot: templates,
      relkitExecutable: "relkit",
      onProgress: (message) => progress.push(message),
    },
  );
  const manifest = JSON.parse(await readFile(join(result.destination, "package.json"), "utf8"));
  return { root: result.destination, manifest, progress };
}

/**
 * Reads a file when it exists.
 * @param path - Absolute path.
 * @returns Its text, or undefined.
 */
async function optional(path: string) {
  return lstat(path).then(
    () => readFile(path, "utf8"),
    () => undefined,
  );
}

for (const drizzle of [false, true]) {
  test(`npm projects get allowScripts and no patch declaration (drizzle=${drizzle})`, async () => {
    const patch = await readDrizzlePatch();
    const { root, manifest, progress } = await create("npm", drizzle);
    expect(manifest.allowScripts).toEqual({ esbuild: true });
    expect(manifest.patchedDependencies).toBeUndefined();
    expect(await optional(join(root, patch.path))).toBeUndefined();
    expect(await optional(join(root, "pnpm-workspace.yaml"))).toBeUndefined();
    expect(progress.includes(SKIPPED_PATCH)).toBe(drizzle);
  });

  test(`pnpm projects declare the patch in pnpm-workspace.yaml (drizzle=${drizzle})`, async () => {
    const patch = await readDrizzlePatch();
    const { root, manifest } = await create("pnpm", drizzle);
    expect(manifest.allowScripts).toBeUndefined();
    expect(manifest.patchedDependencies).toBeUndefined();
    const workspace = await optional(join(root, "pnpm-workspace.yaml"));
    expect(workspace).toContain("allowBuilds:\n  esbuild: true\n");
    const entry = `patchedDependencies:\n  ${patch.key}: ${patch.path}\n`;
    expect(workspace?.includes(entry)).toBe(drizzle);
    expect(await optional(join(root, patch.path))).toBe(drizzle ? patch.content : undefined);
  });

  test(`Bun projects declare the patch in package.json (drizzle=${drizzle})`, async () => {
    const patch = await readDrizzlePatch();
    const { root, manifest } = await create("bun", drizzle);
    expect(manifest.allowScripts).toBeUndefined();
    expect(manifest.patchedDependencies).toEqual(drizzle ? { [patch.key]: patch.path } : undefined);
    expect(await optional(join(root, "pnpm-workspace.yaml"))).toBeUndefined();
    expect(await optional(join(root, patch.path))).toBe(drizzle ? patch.content : undefined);
  });
}

test("adding Drizzle to an npm project skips the patch declaration with a notice", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-manager-add-"));
  parents.push(root);
  const source = `${JSON.stringify({ packageManager: "npm@11.19.1", dependencies: {} }, null, 2)}\n`;
  await writeFile(join(root, "package.json"), source);
  const plan = await planDependencyPatch(root, source, await readDrizzlePatch());
  expect(plan).toEqual({ content: source, notice: SKIPPED_PATCH });
  // A project without the field is recognised by its lockfile.
  const bare = `${JSON.stringify({ dependencies: {} }, null, 2)}\n`;
  await writeFile(join(root, "package.json"), bare);
  await writeFile(join(root, "package-lock.json"), "{}\n");
  expect((await planDependencyPatch(root, bare, await readDrizzlePatch())).notice).toBe(
    SKIPPED_PATCH,
  );
});

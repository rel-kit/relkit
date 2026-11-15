/** Exercises `relkit add` repair planning per package manager: npm shows the skipped repair as a warning and approves esbuild's install script, pnpm reads the patch from its workspace file. */
import { expect } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyScaffoldPlan } from "../../src/scaffolding/add-transaction.js";
import { SKIPPED_PATCH, readDrizzlePatch } from "create-relkit/dependency-patches";
import { patchBuilder, withProject } from "./dependency-patches.fixture.js";

const database = ["drizzle-orm", "drizzle-kit"] as const;

/**
 * Reads the planned manifest of a finished plan.
 * @param plan - Plan whose `package.json` operation is parsed.
 * @returns The manifest.
 */
function manifestOf(plan: { readonly operations: readonly { path: string; content: string }[] }) {
  const operation = plan.operations.find((item) => item.path === "package.json");
  return JSON.parse(operation?.content ?? "{}");
}

/** Verifies that an npm project gets the skipped-repair warning and an approved esbuild install script.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseNpmShowsTheSkippedRepairAndApprovesEsbuild() {
  await withProject(
    async (root) => {
      const plan = await patchBuilder(root, true, database).finish();
      expect(plan.warnings).toEqual([{ code: "dependency-patch-skipped", message: SKIPPED_PATCH }]);
      const manifest = manifestOf(plan);
      expect(manifest.patchedDependencies).toBeUndefined();
      expect(manifest.allowScripts).toEqual({ esbuild: true });
      expect(plan.operations.map((item) => item.path)).toEqual(["package.json"]);
    },
    { packageManager: "npm@11.19.1" },
  );
}

/** Verifies that an existing allowScripts object keeps its entries and its own esbuild decision.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseNpmMergesIntoAnExistingAllowScripts() {
  await withProject(
    async (root) => {
      const plan = await patchBuilder(root, true, database).finish();
      expect(manifestOf(plan).allowScripts).toEqual({ esbuild: true, sharp: true });
    },
    { packageManager: "npm@11.19.1", allowScripts: { sharp: true } },
  );
  await withProject(
    async (root) => {
      const plan = await patchBuilder(root, true, database).finish();
      expect(manifestOf(plan).allowScripts).toEqual({ esbuild: false });
    },
    { packageManager: "npm@11.19.1", allowScripts: { esbuild: false } },
  );
}

/** Verifies that npm projects without a package needing esbuild keep their manifest free of allowScripts.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseNpmWithoutEsbuildPackageGetsNoAllowScripts() {
  await withProject(
    async (root) => {
      const plan = await patchBuilder(root, true, ["drizzle-orm"]).finish();
      expect(manifestOf(plan).allowScripts).toBeUndefined();
      expect(plan.warnings.map((warning) => warning.code)).toEqual(["dependency-patch-skipped"]);
    },
    { packageManager: "npm@11.19.1" },
  );
}

/** Verifies that a Bun project keeps the manifest patch entry and gets neither warning nor allowScripts.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseBunKeepsThePackageJsonPatchEntry() {
  await withProject(
    async (root) => {
      const patch = await readDrizzlePatch();
      const plan = await patchBuilder(root, true, database).finish();
      const manifest = manifestOf(plan);
      expect(manifest.patchedDependencies).toEqual({ [patch.key]: patch.path });
      expect(manifest.allowScripts).toBeUndefined();
      expect(plan.warnings).toEqual([]);
      expect(plan.operations.some((item) => item.path === "pnpm-workspace.yaml")).toBe(false);
    },
    { packageManager: "bun@1.3.10" },
  );
}

/** Verifies that a pnpm project gets its patch entry in pnpm-workspace.yaml, never in package.json.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function casePnpmWritesThePatchToTheWorkspaceFile() {
  await withProject(
    async (root) => {
      const patch = await readDrizzlePatch();
      const entry = `patchedDependencies:\n  ${patch.key}: ${patch.path}\n`;
      const plan = await patchBuilder(root, true, database).finish();
      expect(manifestOf(plan).patchedDependencies).toBeUndefined();
      expect(manifestOf(plan).allowScripts).toBeUndefined();
      expect(plan.warnings).toEqual([]);
      const workspace = plan.operations.find((item) => item.path === "pnpm-workspace.yaml");
      expect(workspace).toEqual({ path: "pnpm-workspace.yaml", action: "create", content: entry });
      expect(plan.operations.find((item) => item.path === patch.path)?.content).toBe(patch.content);
      const commands: string[] = [];
      await applyScaffoldPlan(plan, {
        relkitExecutable: "relkit",
        commandRunner: async (command) => {
          commands.push(command[1] ?? "");
          return { exitCode: 0 };
        },
      });
      expect(commands).toEqual(["install", "check"]);
      expect(await readFile(join(root, "pnpm-workspace.yaml"), "utf8")).toBe(entry);
      expect(JSON.parse(await readFile(join(root, "package.json"), "utf8"))).not.toHaveProperty(
        "patchedDependencies",
      );
    },
    { packageManager: "pnpm@11.1.0" },
  );
}

/** Verifies that an existing workspace file is extended, and that a delivered entry is left alone.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function casePnpmExtendsAnExistingWorkspaceFile() {
  await withProject(
    async (root) => {
      const patch = await readDrizzlePatch();
      await writeFile(join(root, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true");
      const plan = await patchBuilder(root, true, database).finish();
      expect(plan.operations.find((item) => item.path === "pnpm-workspace.yaml")).toEqual({
        path: "pnpm-workspace.yaml",
        action: "update",
        content: `allowBuilds:\n  esbuild: true\npatchedDependencies:\n  ${patch.key}: ${patch.path}\n`,
      });
      await mkdir(join(root, "patches"));
      await writeFile(join(root, patch.path), patch.content);
      const delivered = `patchedDependencies:\n  ${patch.key}: ${patch.path}\n`;
      await writeFile(join(root, "pnpm-workspace.yaml"), delivered);
      const again = await patchBuilder(root, true, database).finish();
      expect(again.operations.some((item) => item.path === "pnpm-workspace.yaml")).toBe(false);
    },
    { packageManager: "pnpm@11.1.0" },
  );
}

/** Exercises selection behavior for portable Drizzle repair, using owned temporary projects and awaited installer cleanup. */
import { expect } from "bun:test";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { applyScaffoldPlan } from "../../src/scaffolding/add-transaction.js";
import { readDrizzlePatch } from "create-relkit/internal/dependency-patches";
import { patchBuilder, withProject } from "./dependency-patches.fixture.js";
import { SCAFFOLD_DEPENDENCIES } from "create-relkit/internal/scaffold-catalog";

/** Verifies that patch-only plans install, retain public package results, and can be finished twice.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function casePatchOnlyPlansInstallRetainPublicPackage() {
  await withProject(async (root) => {
    const builder = patchBuilder(root);
    const plan = await builder.finish();
    expect(plan.dependencies).toEqual({});
    expect(await builder.finish()).toEqual(plan);
    const commands: string[] = [];
    const result = await applyScaffoldPlan(plan, {
      relkitExecutable: "relkit",
      commandRunner: async (command) => {
        commands.push(command[1] ?? "");
        return { exitCode: 0 };
      },
    });
    expect(commands).toEqual(["install", "check"]);
    expect(result.installedPackages).toEqual([]);
    expect(result.verification.status).toBe("passed");
  });
}

/** Verifies that leaves generic testing dependencies free of a Drizzle repair.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseLeavesGenericTestingDependenciesFreeOfA() {
  const testingManifest = JSON.parse(
    await readFile(new URL("../../../testing/package.json", import.meta.url), "utf8"),
  );
  await withProject(
    async (root) => {
      const plan = await patchBuilder(root, true, []).finish();
      expect(plan.dependencies).toEqual({});
      const result = await applyScaffoldPlan(plan, {
        relkitExecutable: "relkit",
        commandRunner: async () => ({ exitCode: 0 }),
      });
      const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
      expect(manifest.dependencies).not.toHaveProperty("drizzle-orm");
      expect(manifest.patchedDependencies).toBeUndefined();
      expect(result.installedPackages).toEqual([]);
    },
    { dependencies: { "@relkit/testing": testingManifest.version } },
  );
}

/** Verifies that adding Effect MQ delivers its transitive Drizzle repair and reports only the new provider.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseAddingEffectMQDeliversItsTransitiveDrizzle() {
  await withProject(
    async (root) => {
      const plan = await patchBuilder(root, true, ["@relkit/effect-mq"]).finish();
      expect(plan.dependencies).toEqual({
        "@relkit/effect-mq": SCAFFOLD_DEPENDENCIES["@relkit/effect-mq"].version,
      });
      const result = await applyScaffoldPlan(plan, {
        relkitExecutable: "relkit",
        commandRunner: async () => ({ exitCode: 0 }),
      });
      const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
      expect(manifest.dependencies).not.toHaveProperty("drizzle-orm");
      const patch = await readDrizzlePatch();
      expect(manifest.patchedDependencies[patch.key]).toBe(patch.path);
      expect(result.installedPackages).toEqual(["@relkit/effect-mq"]);
    },
    { dependencies: {} },
  );
}

/** Verifies that manifest-only patch registration also installs an already delivered asset.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseManifestOnlyPatchRegistrationAlsoInstallsAn() {
  await withProject(async (root) => {
    const patch = await readDrizzlePatch();
    await mkdir(join(root, "patches"));
    await writeFile(join(root, patch.path), patch.content);
    const plan = await patchBuilder(root).finish();
    expect(plan.operations.map((operation) => operation.path)).toEqual(["package.json"]);
    const commands: string[] = [];
    await applyScaffoldPlan(plan, {
      relkitExecutable: "relkit",
      commandRunner: async (command) => {
        commands.push(command[1] ?? "");
        return { exitCode: 0 };
      },
    });
    expect(commands).toEqual(["install", "check"]);
  });
}

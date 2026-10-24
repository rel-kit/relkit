/** Proves canonical Drizzle repair is selected before install and remains portable without install. */
import { expect, test } from "bun:test";
import { cp, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readDrizzlePatch } from "../src/dependency-patches.js";
import type { DependencyPatch } from "../src/dependency-patches.types.js";
import { generateProject } from "../src/generate.js";
import { normalizeCreateOptions } from "../src/options.js";

const templateRoot = resolve(import.meta.dir, "../../../templates/default/v1");

for (const install of [true, false]) {
  for (const template of ["minimal", "api", "agent", "fullstack"] as const) {
    test(`${template} omits unselected Drizzle repair with install=${install}`, async () => {
      const parent = await mkdtemp(join(tmpdir(), "relkit-patch-unselected-"));
      try {
        const patch = await readDrizzlePatch();
        const commands: string[] = [];
        const result = await generateProject(
          normalizeCreateOptions([
            template,
            "--template",
            template,
            "--no-git",
            ...(install ? [] : ["--no-install"]),
          ]),
          {
            cwd: parent,
            templateRoot,
            relkitExecutable: "relkit",
            commandRunner: async (command, cwd) => {
              if (!install) throw new Error("no-install must not execute commands");
              commands.push(command[1] ?? "");
              if (command[1] === "install") await assertRepair(cwd, patch, false);
              return { exitCode: 0 };
            },
          },
        );
        expect(commands).toEqual(install ? ["install", "doctor", "dev"] : []);
        expect(result.installed).toBe(install);
        expect(result.files).not.toContain(patch.path);
        await assertRepair(result.destination, patch, false);
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    });
  }

  for (const section of ["dependencies", "devDependencies"] as const) {
    test(`selected Drizzle in ${section} owns exact repair with install=${install}`, async () => {
      const parent = await mkdtemp(join(tmpdir(), "relkit-patch-selected-"));
      try {
        const patch = await readDrizzlePatch();
        expect(patch.content).toBe(
          await readFile(resolve(import.meta.dir, "../../../patches/drizzle-orm.patch"), "utf8"),
        );
        const selectedRoot = await drizzleTemplate(parent, section, patch.version);
        const commands: string[] = [];
        const result = await generateProject(
          normalizeCreateOptions(["selected", "--no-git", ...(install ? [] : ["--no-install"])]),
          {
            cwd: parent,
            templateRoot: selectedRoot,
            relkitExecutable: "relkit",
            commandRunner: async (command, cwd) => {
              if (!install) throw new Error("no-install must not execute commands");
              commands.push(command[1] ?? "");
              if (command[1] === "install") await assertRepair(cwd, patch, true);
              return { exitCode: 0 };
            },
          },
        );
        expect(commands).toEqual(install ? ["install", "doctor", "dev"] : []);
        expect(result.installed).toBe(install);
        expect(result.files).toContain(patch.path);
        await assertRepair(result.destination, patch, true);
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    });
  }
}

/** Selects the real SDK in a copied template manifest without installing or stubbing it.
 * @param parent - Test-owned temporary root.
 * @param section - Actual dependency section selecting Drizzle.
 * @param version - Canonical release-owned SDK version.
 * @returns Complete copied template root passed to the real generator.
 */
async function drizzleTemplate(
  parent: string,
  section: "dependencies" | "devDependencies",
  version: string,
): Promise<string> {
  const root = join(parent, "templates");
  await cp(join(templateRoot, "minimal"), join(root, "minimal"), { recursive: true });
  const path = join(root, "minimal/package.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  manifest[section]["drizzle-orm"] = version;
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return root;
}

/** Checks the published asset and manifest together, including the first-install boundary.
 * @param root - Generator-owned stage or published project.
 * @param patch - Validated canonical repair descriptor.
 * @param selected - Literal fixture expectation independent of generated output.
 * @returns Completion after exact repair or absence assertions.
 */
async function assertRepair(
  root: string,
  patch: DependencyPatch,
  selected: boolean,
): Promise<void> {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  expect(Object.values(manifest.dependencies)).not.toContain("catalog:");
  if (selected) {
    expect(manifest.patchedDependencies).toEqual({ [patch.key]: patch.path });
    expect(await readFile(join(root, patch.path), "utf8")).toBe(patch.content);
  } else {
    expect(manifest.dependencies["drizzle-orm"]).toBeUndefined();
    expect(manifest.devDependencies["drizzle-orm"]).toBeUndefined();
    expect(manifest.patchedDependencies).toBeUndefined();
    await expect(lstat(join(root, patch.path))).rejects.toMatchObject({ code: "ENOENT" });
  }
}
